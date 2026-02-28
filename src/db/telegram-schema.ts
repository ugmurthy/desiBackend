import type { Database } from "bun:sqlite";

// --- Types ---

export type TelegramUserState =
  | "new"
  | "awaiting_email"
  | "awaiting_otp"
  | "verified"
  | "ready";

export type TelegramRequestState =
  | "pending"
  | "executing"
  | "awaiting_clarification"
  | "completed"
  | "failed";

export type TelegramDispatchEventType =
  | "onboarding"
  | "request_accepted"
  | "clarification"
  | "completion"
  | "failure"
  | "artifact_delivery"
  | "profile_change";

export interface TelegramIdentity {
  id: string;
  telegramUserId: string;
  chatId: string;
  userId: string | null;
  tenantId: string;
  email: string | null;
  verified: number;
  state: TelegramUserState;
  activeProfileId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TelegramSession {
  id: string;
  telegramIdentityId: string;
  otpHash: string;
  failedAttempts: number;
  maxAttempts: number;
  expiresAt: number;
  completedAt: number | null;
  createdAt: number;
}

export interface TelegramRequest {
  id: string;
  telegramIdentityId: string;
  chatId: string;
  profileId: string | null;
  dagId: string | null;
  executionId: string | null;
  state: TelegramRequestState;
  requestText: string;
  createdAt: number;
  updatedAt: number;
}

export interface TelegramDispatchLog {
  id: string;
  telegramIdentityId: string;
  chatId: string;
  requestId: string | null;
  eventType: TelegramDispatchEventType;
  idempotencyKey: string | null;
  telegramMessageId: string | null;
  payload: string | null;
  createdAt: number;
}

export interface ProfileRegistry {
  id: string;
  name: string;
  description: string | null;
  handler: string;
  enabled: number;
  createdAt: number;
  updatedAt: number;
}

// --- Tenant DB schemas ---

export function initializeTelegramIdentitySchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_identities (
      id TEXT PRIMARY KEY,
      telegramUserId TEXT NOT NULL,
      chatId TEXT NOT NULL,
      userId TEXT,
      tenantId TEXT NOT NULL,
      email TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'new',
      activeProfileId TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_identities_telegram_user_id
      ON telegram_identities(telegramUserId);
    CREATE INDEX IF NOT EXISTS idx_telegram_identities_chat_id
      ON telegram_identities(chatId);
    CREATE INDEX IF NOT EXISTS idx_telegram_identities_user_id
      ON telegram_identities(userId);
    CREATE INDEX IF NOT EXISTS idx_telegram_identities_state
      ON telegram_identities(state);
  `);
}

export function initializeTelegramSessionSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_sessions (
      id TEXT PRIMARY KEY,
      telegramIdentityId TEXT NOT NULL,
      otpHash TEXT NOT NULL,
      failedAttempts INTEGER NOT NULL DEFAULT 0,
      maxAttempts INTEGER NOT NULL DEFAULT 3,
      expiresAt INTEGER NOT NULL,
      completedAt INTEGER,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (telegramIdentityId) REFERENCES telegram_identities(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_sessions_identity_id
      ON telegram_sessions(telegramIdentityId);
  `);
}

export function initializeTelegramRequestSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_requests (
      id TEXT PRIMARY KEY,
      telegramIdentityId TEXT NOT NULL,
      chatId TEXT NOT NULL,
      profileId TEXT,
      dagId TEXT,
      executionId TEXT,
      state TEXT NOT NULL DEFAULT 'pending',
      requestText TEXT NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (telegramIdentityId) REFERENCES telegram_identities(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_requests_identity_id
      ON telegram_requests(telegramIdentityId);
    CREATE INDEX IF NOT EXISTS idx_telegram_requests_state
      ON telegram_requests(state);
    CREATE INDEX IF NOT EXISTS idx_telegram_requests_execution_id
      ON telegram_requests(executionId);
  `);
}

export function initializeTelegramDispatchLogSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_dispatch_log (
      id TEXT PRIMARY KEY,
      telegramIdentityId TEXT NOT NULL,
      chatId TEXT NOT NULL,
      requestId TEXT,
      eventType TEXT NOT NULL,
      idempotencyKey TEXT,
      telegramMessageId TEXT,
      payload TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (telegramIdentityId) REFERENCES telegram_identities(id) ON DELETE CASCADE,
      FOREIGN KEY (requestId) REFERENCES telegram_requests(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_dispatch_log_idempotency_key
      ON telegram_dispatch_log(idempotencyKey);
    CREATE INDEX IF NOT EXISTS idx_telegram_dispatch_log_identity_id
      ON telegram_dispatch_log(telegramIdentityId);
    CREATE INDEX IF NOT EXISTS idx_telegram_dispatch_log_request_id
      ON telegram_dispatch_log(requestId);
    CREATE INDEX IF NOT EXISTS idx_telegram_dispatch_log_event_type
      ON telegram_dispatch_log(eventType);
  `);
}

// --- Admin DB schema ---

export function initializeProfileRegistrySchema(db: Database): void {
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

    CREATE INDEX IF NOT EXISTS idx_profile_registry_name
      ON profile_registry(name);
    CREATE INDEX IF NOT EXISTS idx_profile_registry_enabled
      ON profile_registry(enabled);
  `);
}

// --- Composite initialization ---

export function initializeTelegramSchemas(db: Database): void {
  initializeTelegramIdentitySchema(db);
  initializeTelegramSessionSchema(db);
  initializeTelegramRequestSchema(db);
  initializeTelegramDispatchLogSchema(db);
}
