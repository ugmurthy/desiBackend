import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeTelegramSchemas } from "../db/telegram-schema";
import {
  handleTelegramUpdate,
  seedDefaultProfile,
  type TelegramUpdate,
} from "./telegram-bot";

// --- Mock Telegram API ---
const sentMessages: { chatId: string; text: string }[] = [];

// Mock fetch globally
const originalFetch = globalThis.fetch;

function mockFetch() {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    if (urlStr.includes("api.telegram.org")) {
      const body = JSON.parse(init?.body as string);
      sentMessages.push({ chatId: body.chat_id, text: body.text });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return originalFetch(url, init);
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// --- Mock admin DB for profile queries ---
let adminDb: Database;
const originalImport = await import("../db/admin-schema");
const originalGetAdminDatabase = originalImport.getAdminDatabase;

// We'll create an in-memory admin DB and patch it
function setupAdminDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_registry (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      handler TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_profile_registry_name ON profile_registry(name);
    CREATE INDEX IF NOT EXISTS idx_profile_registry_enabled ON profile_registry(enabled);
  `);
  return db;
}

// --- Test helpers ---

function createTenantDb(): Database {
  const db = new Database(":memory:");
  // Create users table (needed for OTP verification flow)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      tenantId TEXT NOT NULL,
      apiKeyId TEXT,
      passwordHash TEXT,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      emailVerificationToken TEXT,
      emailVerificationExpiry INTEGER,
      passwordResetToken TEXT,
      passwordResetExpiry INTEGER,
      inviteToken TEXT,
      inviteExpiry INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  initializeTelegramSchemas(db);
  return db;
}

function makeUpdate(
  userId: number,
  chatId: number,
  text: string
): TelegramUpdate {
  return {
    update_id: Math.floor(Math.random() * 100000),
    message: {
      message_id: 1,
      from: {
        id: userId,
        is_bot: false,
        first_name: "Test",
      },
      chat: {
        id: chatId,
        type: "private",
      },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
}

function getIdentity(db: Database, telegramUserId: string) {
  return db
    .prepare("SELECT * FROM telegram_identities WHERE telegramUserId = ?")
    .get(telegramUserId) as Record<string, unknown> | undefined;
}

function lastMessage(): { chatId: string; text: string } | undefined {
  return sentMessages[sentMessages.length - 1];
}

// --- Tests ---

describe("Telegram Bot - US-003: Onboarding and Access Blocking", () => {
  let db: Database;
  const BOT_TOKEN = "test-bot-token";
  const TENANT_ID = "test-tenant";
  const TENANT_NAME = "TestTenant";

  beforeEach(() => {
    db = createTenantDb();
    adminDb = setupAdminDb();
    // Patch getAdminDatabase to return our in-memory admin DB
    // We can't easily mock module-level imports, so we'll use a workaround
    sentMessages.length = 0;
    mockFetch();
  });

  afterEach(() => {
    db.close();
    adminDb.close();
    restoreFetch();
  });

  test("/start creates identity and prompts for email", async () => {
    const update = makeUpdate(12345, 67890, "/start");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const identity = getIdentity(db, "12345");
    expect(identity).toBeDefined();
    expect(identity!.state).toBe("awaiting_email");
    expect(identity!.tenantId).toBe(TENANT_ID);

    const msg = lastMessage();
    expect(msg).toBeDefined();
    expect(msg!.text).toContain("email");
  });

  test("no identity prompts /start", async () => {
    const update = makeUpdate(99999, 67890, "hello");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const msg = lastMessage();
    expect(msg).toBeDefined();
    expect(msg!.text).toContain("/start");
  });

  test("invalid email rejected in awaiting_email state", async () => {
    // Create identity in awaiting_email state
    const startUpdate = makeUpdate(12345, 67890, "/start");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, startUpdate);

    sentMessages.length = 0;

    const emailUpdate = makeUpdate(12345, 67890, "not-an-email");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, emailUpdate);

    const msg = lastMessage();
    expect(msg).toBeDefined();
    expect(msg!.text).toContain("valid email");
  });

  test("commands blocked during awaiting_email state", async () => {
    const startUpdate = makeUpdate(12345, 67890, "/start");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, startUpdate);

    sentMessages.length = 0;

    const cmdUpdate = makeUpdate(12345, 67890, "/profiles");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, cmdUpdate);

    const msg = lastMessage();
    expect(msg).toBeDefined();
    expect(msg!.text).toContain("email");
  });

  test("/start on already verified user shows already verified", async () => {
    // Manually create a verified identity
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, verified, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'verified', 1, ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    const update = makeUpdate(12345, 67890, "/start");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const msg = lastMessage();
    expect(msg).toBeDefined();
    expect(msg!.text).toContain("already verified");
  });

  test("unverified user blocked from plain text execution", async () => {
    // Create identity in 'new' state
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'new', ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    const update = makeUpdate(12345, 67890, "run my report");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const msg = lastMessage();
    expect(msg).toBeDefined();
    expect(msg!.text).toContain("verification");
    expect(msg!.text).toContain("/start");
  });

  test("verified user transitions to ready on first interaction", async () => {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, verified, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'verified', 1, ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    const update = makeUpdate(12345, 67890, "hello");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const identity = getIdentity(db, "12345");
    expect(identity!.state).toBe("ready");

    const msg = lastMessage();
    expect(msg!.text).toContain("ready");
  });

  test("ready user receives acknowledgment for plain text", async () => {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, verified, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'ready', 1, ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    const update = makeUpdate(12345, 67890, "generate a sales report");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const msg = lastMessage();
    expect(msg).toBeDefined();
    expect(msg!.text).toContain("Request received");
  });

  test("unknown command returns help text", async () => {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, verified, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'ready', 1, ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    const update = makeUpdate(12345, 67890, "/unknown");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const msg = lastMessage();
    expect(msg!.text).toContain("Unknown command");
    expect(msg!.text).toContain("/start");
  });

  test("/start resets state for stuck user in awaiting_otp", async () => {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'awaiting_otp', 'test@test.com', ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    // Sending /start during awaiting_otp should restart
    const update = makeUpdate(12345, 67890, "/start");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const identity = getIdentity(db, "12345");
    expect(identity!.state).toBe("awaiting_email");

    const msg = lastMessage();
    expect(msg!.text).toContain("email");
  });

  test("no message (empty update) is silently ignored", async () => {
    const update: TelegramUpdate = { update_id: 123 };
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);
    expect(sentMessages.length).toBe(0);
  });
});

describe("Telegram Bot - US-004: Profile Commands", () => {
  let db: Database;
  const BOT_TOKEN = "test-bot-token";
  const TENANT_ID = "test-tenant";
  const TENANT_NAME = "TestTenant";

  beforeEach(() => {
    db = createTenantDb();
    adminDb = setupAdminDb();
    sentMessages.length = 0;
    mockFetch();
  });

  afterEach(() => {
    db.close();
    adminDb.close();
    restoreFetch();
  });

  // Note: Profile commands require getAdminDatabase to return the admin DB.
  // Since we can't easily mock the module import in these unit tests,
  // these tests verify the command parsing and state machine behavior.
  // Integration tests would verify actual profile DB queries.

  test("/profiles blocked for unverified user", async () => {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'new', ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    const update = makeUpdate(12345, 67890, "/profiles");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const msg = lastMessage();
    expect(msg).toBeDefined();
    expect(msg!.text).toContain("verification");
  });

  test("/use without args shows usage", async () => {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, verified, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'ready', 1, ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    const update = makeUpdate(12345, 67890, "/use");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const msg = lastMessage();
    expect(msg!.text).toContain("Usage");
    expect(msg!.text).toContain("/profiles");
  });

  test("/use with invalid profile returns error", async () => {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, verified, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'ready', 1, ?, ?)`
    ).run(id, "12345", "67890", TENANT_ID, now, now);

    const update = makeUpdate(12345, 67890, "/use nonexistent");
    await handleTelegramUpdate(db, BOT_TOKEN, TENANT_ID, TENANT_NAME, update);

    const msg = lastMessage();
    expect(msg!.text).toContain("not found");
  });
});
