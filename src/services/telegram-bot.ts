import type { Database } from "bun:sqlite";
import type { TelegramIdentity, ProfileRegistry, TelegramRequest } from "../db/telegram-schema";
import {
  getIdentityByTelegramUserId,
  createIdentity,
  updateIdentityEmail,
  updateIdentityState,
  issueOtp,
  completeVerification,
} from "./telegram-otp";
import { getAdminDatabase } from "../db/admin-schema";
import {
  getActiveRequest,
  hasActiveRequest,
  createRequest,
  updateRequestExecution,
  updateRequestState,
} from "./telegram-request";
import {
  resolveProfileForIdentity,
  resolveHandler,
} from "./telegram-profile-router";
import { startExecutionPolling } from "./telegram-polling";
import {
  recordDispatch,
  hasDispatched,
  onboardingKey,
  requestAcceptedKey,
  clarificationKey,
  completionKey,
  failureKey,
  profileChangeKey,
  getClarificationRound,
} from "./telegram-dispatch";
import { checkRateLimit } from "./telegram-rate-limit";
import { insertResourceOwnership } from "../db/user-schema";

// --- Telegram API types ---

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

// --- Telegram Bot API helper ---

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

// --- Email validation ---

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(input: string): boolean {
  return EMAIL_REGEX.test(input.trim());
}

// --- Command parsing ---

interface ParsedCommand {
  command: string | null;
  args: string;
}

function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return { command: null, args: trimmed };
  }
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { command: trimmed.toLowerCase(), args: "" };
  }
  return {
    command: trimmed.slice(0, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

// --- Profile helpers ---

function getEnabledProfiles(): ProfileRegistry[] {
  const adminDb = getAdminDatabase();
  const stmt = adminDb.prepare(
    `SELECT * FROM profile_registry WHERE enabled = 1 ORDER BY name`
  );
  return stmt.all() as ProfileRegistry[];
}

function getProfileByName(name: string): ProfileRegistry | null {
  const adminDb = getAdminDatabase();
  const stmt = adminDb.prepare(
    `SELECT * FROM profile_registry WHERE name = ? AND enabled = 1`
  );
  return (stmt.get(name) as ProfileRegistry) ?? null;
}

function setActiveProfile(
  db: Database,
  identityId: string,
  profileId: string
): void {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(
    `UPDATE telegram_identities SET activeProfileId = ?, updatedAt = ? WHERE id = ?`
  );
  stmt.run(profileId, now, identityId);
}

// --- Seed default profile ---

export function seedDefaultProfile(): void {
  const adminDb = getAdminDatabase();
  const existing = adminDb
    .prepare(`SELECT id FROM profile_registry WHERE name = 'default'`)
    .get();
  if (existing) return;

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  adminDb
    .prepare(
      `INSERT INTO profile_registry (id, name, description, handler, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      id,
      "default",
      "Default profile — routes requests to create-and-execute flow",
      "create-and-execute",
      now,
      now
    );
}

// --- Commands that require verification ---

const VERIFIED_COMMANDS = new Set(["/profiles", "/use"]);

// --- Main update handler ---

export async function handleTelegramUpdate(
  db: Database,
  botToken: string,
  tenantId: string,
  tenantName: string,
  update: TelegramUpdate
): Promise<void> {
  const message = update.message;
  if (!message || !message.from || !message.text) return;

  const telegramUserId = String(message.from.id);
  const chatId = String(message.chat.id);
  const text = message.text;
  const { command, args } = parseCommand(text);

  // --- /start command ---
  if (command === "/start") {
    await handleStart(db, botToken, telegramUserId, chatId, tenantId);
    return;
  }

  // Lookup identity
  const identity = getIdentityByTelegramUserId(db, telegramUserId);

  if (!identity) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "👋 Welcome! Please send /start to begin."
    );
    return;
  }

  // --- State: awaiting_email ---
  if (identity.state === "awaiting_email") {
    await handleEmailInput(db, botToken, chatId, identity, text, tenantName);
    return;
  }

  // --- State: awaiting_otp ---
  if (identity.state === "awaiting_otp") {
    await handleOtpInput(db, botToken, chatId, identity, text);
    return;
  }

  // --- Block unverified users from verified-only commands ---
  if (identity.state !== "verified" && identity.state !== "ready") {
    await sendTelegramMessage(
      botToken,
      chatId,
      "🔒 You need to complete verification first.\nSend /start to begin the verification process."
    );
    return;
  }

  // --- Verified/ready user commands ---

  // US-012: Rate limit commands for verified users
  if (command) {
    const cmdRl = checkRateLimit("command", telegramUserId);
    if (!cmdRl.allowed) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "⚠️ Too many commands. Please slow down and try again shortly."
      );
      return;
    }
  }

  if (command === "/profiles") {
    await handleProfiles(botToken, chatId);
    return;
  }

  if (command === "/use") {
    // US-006: Block profile switch during active request lifecycle
    if (hasActiveRequest(db, identity.id)) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "⚠️ Cannot switch profiles while you have an active request.\nPlease wait for your current request to complete or fail."
      );
      return;
    }
    await handleUseProfile(db, botToken, chatId, identity, args);
    return;
  }

  // --- Block other commands for non-ready users ---
  if (identity.state === "verified") {
    // Auto-transition verified → ready
    updateIdentityState(db, identity.id, "ready");
    await sendTelegramMessage(
      botToken,
      chatId,
      "✅ You are verified and ready!\n\nYou can now:\n• Send text messages to execute requests\n• Use /profiles to view available profiles\n• Use /use <profile> to switch profiles"
    );
    return;
  }

  // --- Ready state: plain text → request handling (US-005/US-006/US-007) ---
  if (identity.state === "ready" && !command) {
    const activeReq = getActiveRequest(db, identity.id);

    if (activeReq && activeReq.state === "awaiting_clarification") {
      // US-007: Clarification response
      await handleClarificationResponse(db, botToken, chatId, identity, activeReq, text);
      return;
    }

    if (activeReq) {
      // US-006: Reject overlapping request
      await sendTelegramMessage(
        botToken,
        chatId,
        "⏳ You already have an active request. Please wait for it to complete before submitting a new one."
      );
      return;
    }

    // US-005 + US-007: Submit new request via profile router
    await handleNewRequest(db, botToken, chatId, identity, text);
    return;
  }

  // Unknown command
  if (command) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `Unknown command: ${command}\n\nAvailable commands:\n/start — Begin verification\n/profiles — View profiles\n/use <profile> — Switch profile`
    );
  }
}

// --- Command handlers ---

async function handleStart(
  db: Database,
  botToken: string,
  telegramUserId: string,
  chatId: string,
  tenantId: string
): Promise<void> {
  let identity = getIdentityByTelegramUserId(db, telegramUserId);

  if (!identity) {
    identity = createIdentity(db, telegramUserId, chatId, tenantId);
  } else if (identity.state === "verified" || identity.state === "ready") {
    await sendTelegramMessage(
      botToken,
      chatId,
      "✅ You are already verified!\n\nSend a text message to execute a request, or use /profiles to view available profiles."
    );
    return;
  } else {
    // Reset to awaiting_email for re-verification
    updateIdentityState(db, identity.id, "awaiting_email");
  }

  await sendTelegramMessage(
    botToken,
    chatId,
    "👋 Welcome to desiAgent!\n\nTo get started, please enter your registered email address."
  );

  // US-011: Audit log onboarding
  recordDispatch(db, {
    identityId: identity.id,
    chatId,
    eventType: "onboarding",
    idempotencyKey: onboardingKey(identity.id),
  });
}

async function handleEmailInput(
  db: Database,
  botToken: string,
  chatId: string,
  identity: TelegramIdentity,
  text: string,
  tenantName: string
): Promise<void> {
  // Reject commands during email input
  if (text.startsWith("/")) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "📧 Please enter your email address to continue verification.\nSend /start to restart."
    );
    return;
  }

  const email = text.trim().toLowerCase();
  if (!isValidEmail(email)) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "❌ That doesn't look like a valid email address. Please try again."
    );
    return;
  }

  // US-012: Rate limit verification attempts
  const rl = checkRateLimit("verification", identity.telegramUserId);
  if (!rl.allowed) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "⚠️ Too many verification attempts. Please try again later."
    );
    return;
  }

  const result = await issueOtp(db, identity.id, email, tenantName);
  if (!result.success) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `❌ Failed to send verification code: ${result.error ?? "Unknown error"}\nPlease try again or send /start to restart.`
    );
    return;
  }

  await sendTelegramMessage(
    botToken,
    chatId,
    `📬 A 6-digit verification code has been sent to *${email}*.\n\nPlease enter the code to complete verification.`
  );
}

async function handleOtpInput(
  db: Database,
  botToken: string,
  chatId: string,
  identity: TelegramIdentity,
  text: string
): Promise<void> {
  // Allow /start to restart
  if (text.trim().toLowerCase() === "/start") {
    updateIdentityState(db, identity.id, "awaiting_email");
    await sendTelegramMessage(
      botToken,
      chatId,
      "🔄 Verification restarted. Please enter your email address."
    );
    return;
  }

  const otpInput = text.trim();
  const result = await completeVerification(db, identity.id, otpInput);

  if (!result.success) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `❌ ${result.error}`
    );
    return;
  }

  // Transition to ready
  updateIdentityState(db, identity.id, "ready");

  await sendTelegramMessage(
    botToken,
    chatId,
    "🎉 Verification successful! You are now ready.\n\nYou can:\n• Send text messages to execute requests\n• Use /profiles to view available profiles\n• Use /use <profile> to switch profiles"
  );
}

async function handleProfiles(
  botToken: string,
  chatId: string
): Promise<void> {
  const profiles = getEnabledProfiles();

  if (profiles.length === 0) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "No profiles are currently available."
    );
    return;
  }

  const lines = profiles.map(
    (p) => `• *${p.name}* — ${p.description ?? "No description"}`
  );

  await sendTelegramMessage(
    botToken,
    chatId,
    `📋 *Available Profiles:*\n\n${lines.join("\n")}\n\nUse /use <profile> to switch.`
  );
}

async function handleUseProfile(
  db: Database,
  botToken: string,
  chatId: string,
  identity: TelegramIdentity,
  profileName: string
): Promise<void> {
  if (!profileName) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "Usage: /use <profile\\_name>\n\nSend /profiles to see available profiles."
    );
    return;
  }

  const profile = getProfileByName(profileName.toLowerCase());
  if (!profile) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `❌ Profile "${profileName}" not found or not enabled.\n\nSend /profiles to see available profiles.`
    );
    return;
  }

  setActiveProfile(db, identity.id, profile.id);

  await sendTelegramMessage(
    botToken,
    chatId,
    `✅ Active profile set to *${profile.name}*.`
  );

  // US-011: Audit log profile change
  recordDispatch(db, {
    identityId: identity.id,
    chatId,
    eventType: "profile_change",
    idempotencyKey: profileChangeKey(identity.id, profile.id),
    payload: JSON.stringify({ profileName: profile.name, profileId: profile.id }),
  });
}

// --- US-005 + US-007: New request submission via profile router ---

async function handleNewRequest(
  db: Database,
  botToken: string,
  chatId: string,
  identity: TelegramIdentity,
  text: string
): Promise<void> {
  // US-012: Rate limit request submissions
  const rl = checkRateLimit("request_submission", identity.telegramUserId);
  if (!rl.allowed) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "⚠️ Too many requests. Please wait before submitting another."
    );
    return;
  }

  // Resolve profile
  const profileId = resolveProfileForIdentity(identity);
  if (!profileId) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "❌ No profile configured. Use /use <profile> to select a profile, or contact your admin."
    );
    return;
  }

  // Resolve handler
  const handler = resolveHandler(profileId);
  if (!handler) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "❌ Profile handler not available. Please try a different profile or contact your admin."
    );
    return;
  }

  // Create request record (persists profileId for auditability - US-005)
  const request = createRequest(db, {
    identityId: identity.id,
    chatId,
    profileId,
    requestText: text,
  });

  await sendTelegramMessage(
    botToken,
    chatId,
    "⏳ Processing your request..."
  );

  try {
    const result = await handler.handleRequest({
      tenantId: identity.tenantId,
      userId: identity.userId ?? "",
      goalText: text,
    });

    if (result.status === "clarification_required") {
      // US-007: Transition to awaiting clarification
      updateRequestExecution(db, request.id, {
        dagId: result.dagId,
        state: "awaiting_clarification",
      });
      if (identity.userId && result.dagId) {
        insertResourceOwnership(db, identity.userId, "dag", result.dagId);
      }
      await sendTelegramMessage(
        botToken,
        chatId,
        `❓ *Clarification needed:*\n\n${result.clarificationQuery}\n\nPlease reply with your answer.`
      );
      // US-011: Audit log clarification
      const round = getClarificationRound(db, request.id);
      recordDispatch(db, {
        identityId: identity.id,
        chatId,
        requestId: request.id,
        eventType: "clarification",
        idempotencyKey: clarificationKey(request.id, round),
        payload: JSON.stringify({ clarificationQuery: result.clarificationQuery }),
      });
      return;
    }

    if (!result.success) {
      // Validation error or other failure
      updateRequestExecution(db, request.id, {
        dagId: result.dagId,
        state: "failed",
      });
      if (identity.userId && result.dagId) {
        insertResourceOwnership(db, identity.userId, "dag", result.dagId);
      }
      await sendTelegramMessage(
        botToken,
        chatId,
        `❌ Request failed: ${result.error ?? "Unknown error"}`
      );
      // US-011: Audit log failure
      recordDispatch(db, {
        identityId: identity.id,
        chatId,
        requestId: request.id,
        eventType: "failure",
        idempotencyKey: failureKey(request.id),
        payload: JSON.stringify({ error: result.error }),
      });
      return;
    }

    // Success
    updateRequestExecution(db, request.id, {
      dagId: result.dagId,
      executionId: result.executionId,
      state: "executing",
    });
    if (identity.userId && result.dagId) {
      insertResourceOwnership(db, identity.userId, "dag", result.dagId);
    }
    if (identity.userId && result.executionId) {
      insertResourceOwnership(db, identity.userId, "execution", result.executionId);
    }
    await sendTelegramMessage(
      botToken,
      chatId,
      `✅ Request accepted!\n\n🔹 Execution: \`${result.executionId}\`\n\nYou'll be notified when it completes.`
    );
    // US-011: Audit log request accepted
    recordDispatch(db, {
      identityId: identity.id,
      chatId,
      requestId: request.id,
      eventType: "request_accepted",
      idempotencyKey: requestAcceptedKey(request.id),
      payload: JSON.stringify({ executionId: result.executionId, dagId: result.dagId }),
    });

    // US-008: Start polling for execution lifecycle notifications
    if (result.executionId) {
      startExecutionPolling({
        botToken,
        chatId,
        tenantId: identity.tenantId,
        requestId: request.id,
        executionId: result.executionId,
        identityId: identity.id,
      });
    }
  } catch (error) {
    updateRequestState(db, request.id, "failed");
    const msg = error instanceof Error ? error.message : "Unknown error";
    await sendTelegramMessage(
      botToken,
      chatId,
      `❌ Request failed: ${msg}`
    );
    // US-011: Audit log failure
    recordDispatch(db, {
      identityId: identity.id,
      chatId,
      requestId: request.id,
      eventType: "failure",
      idempotencyKey: failureKey(request.id),
      payload: JSON.stringify({ error: msg }),
    });
  }
}

// --- US-007: Clarification response handler ---

async function handleClarificationResponse(
  db: Database,
  botToken: string,
  chatId: string,
  identity: TelegramIdentity,
  activeReq: TelegramRequest,
  text: string
): Promise<void> {
  if (!activeReq.profileId || !activeReq.dagId) {
    updateRequestState(db, activeReq.id, "failed");
    await sendTelegramMessage(
      botToken,
      chatId,
      "❌ Request context lost. Please submit a new request."
    );
    return;
  }

  const handler = resolveHandler(activeReq.profileId);
  if (!handler) {
    updateRequestState(db, activeReq.id, "failed");
    await sendTelegramMessage(
      botToken,
      chatId,
      "❌ Profile handler no longer available. Please submit a new request."
    );
    return;
  }

  try {
    const result = await handler.handleClarification({
      tenantId: identity.tenantId,
      dagId: activeReq.dagId,
      userResponse: text,
    });

    if (result.status === "clarification_required") {
      // Another round of clarification
      updateRequestExecution(db, activeReq.id, {
        dagId: result.dagId ?? activeReq.dagId,
        state: "awaiting_clarification",
      });
      await sendTelegramMessage(
        botToken,
        chatId,
        `❓ *Additional clarification needed:*\n\n${result.clarificationQuery}\n\nPlease reply with your answer.`
      );
      // US-011: Audit log clarification
      const round = getClarificationRound(db, activeReq.id);
      recordDispatch(db, {
        identityId: identity.id,
        chatId,
        requestId: activeReq.id,
        eventType: "clarification",
        idempotencyKey: clarificationKey(activeReq.id, round),
        payload: JSON.stringify({ clarificationQuery: result.clarificationQuery }),
      });
      return;
    }

    if (!result.success) {
      updateRequestState(db, activeReq.id, "failed");
      await sendTelegramMessage(
        botToken,
        chatId,
        `❌ Request failed: ${result.error ?? "Unknown error"}`
      );
      // US-011: Audit log failure
      recordDispatch(db, {
        identityId: identity.id,
        chatId,
        requestId: activeReq.id,
        eventType: "failure",
        idempotencyKey: failureKey(activeReq.id),
        payload: JSON.stringify({ error: result.error }),
      });
      return;
    }

    // Clarification resolved successfully
    updateRequestExecution(db, activeReq.id, {
      dagId: result.dagId ?? activeReq.dagId,
      executionId: result.executionId,
      state: result.executionId ? "executing" : "completed",
    });
    if (identity.userId && result.executionId) {
      insertResourceOwnership(db, identity.userId, "execution", result.executionId);
    }

    const successMsg = result.executionId
      ? `✅ Clarification accepted! Execution started.\n\n🔹 Execution: \`${result.executionId}\``
      : `✅ Clarification accepted! DAG created successfully.`;

    await sendTelegramMessage(botToken, chatId, successMsg);

    // US-011: Audit log completion/accepted
    if (result.executionId) {
      recordDispatch(db, {
        identityId: identity.id,
        chatId,
        requestId: activeReq.id,
        eventType: "request_accepted",
        idempotencyKey: requestAcceptedKey(activeReq.id),
        payload: JSON.stringify({ executionId: result.executionId, dagId: result.dagId }),
      });
    } else {
      recordDispatch(db, {
        identityId: identity.id,
        chatId,
        requestId: activeReq.id,
        eventType: "completion",
        idempotencyKey: completionKey(activeReq.id),
      });
    }

    // US-008: Start polling for execution lifecycle notifications
    if (result.executionId) {
      startExecutionPolling({
        botToken,
        chatId,
        tenantId: identity.tenantId,
        requestId: activeReq.id,
        executionId: result.executionId,
        identityId: identity.id,
      });
    }
  } catch (error) {
    updateRequestState(db, activeReq.id, "failed");
    const msg = error instanceof Error ? error.message : "Unknown error";
    await sendTelegramMessage(
      botToken,
      chatId,
      `❌ Request failed: ${msg}`
    );
    // US-011: Audit log failure
    recordDispatch(db, {
      identityId: identity.id,
      chatId,
      requestId: activeReq.id,
      eventType: "failure",
      idempotencyKey: failureKey(activeReq.id),
      payload: JSON.stringify({ error: msg }),
    });
  }
}
