import type { Database } from "bun:sqlite";
import type { TelegramIdentity, TelegramSession } from "../db/telegram-schema";
import { getEmailProvider } from "./email";

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_LENGTH = 6;

// --- OTP generation ---

function generateOtp(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return String(num % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0");
}

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hashBuffer).toString("hex");
}

// --- Result types ---

export interface OtpIssueResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  error?: string;
  remainingAttempts?: number;
}

// --- Identity helpers ---

export function getIdentityByTelegramUserId(
  db: Database,
  telegramUserId: string
): TelegramIdentity | null {
  const stmt = db.prepare(`
    SELECT * FROM telegram_identities WHERE telegramUserId = ?
  `);
  return (stmt.get(telegramUserId) as TelegramIdentity) ?? null;
}

export function createIdentity(
  db: Database,
  telegramUserId: string,
  chatId: string,
  tenantId: string
): TelegramIdentity {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    INSERT INTO telegram_identities (id, telegramUserId, chatId, tenantId, state, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 'awaiting_email', ?, ?)
  `);
  stmt.run(id, telegramUserId, chatId, tenantId, now, now);

  return {
    id,
    telegramUserId,
    chatId,
    userId: null,
    tenantId,
    email: null,
    verified: 0,
    state: "awaiting_email",
    activeProfileId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateIdentityEmail(
  db: Database,
  identityId: string,
  email: string
): void {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    UPDATE telegram_identities
    SET email = ?, state = 'awaiting_otp', updatedAt = ?
    WHERE id = ?
  `);
  stmt.run(email, now, identityId);
}

export function updateIdentityState(
  db: Database,
  identityId: string,
  state: string
): void {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    UPDATE telegram_identities SET state = ?, updatedAt = ? WHERE id = ?
  `);
  stmt.run(state, now, identityId);
}

// --- OTP issuance ---

export async function issueOtp(
  db: Database,
  identityId: string,
  email: string,
  tenantName: string
): Promise<OtpIssueResult> {
  // Invalidate any active (uncompleted, unexpired) sessions for this identity
  const now = Math.floor(Date.now() / 1000);
  const invalidateStmt = db.prepare(`
    UPDATE telegram_sessions
    SET completedAt = ?
    WHERE telegramIdentityId = ? AND completedAt IS NULL AND expiresAt > ?
  `);
  invalidateStmt.run(now, identityId, now);

  // Generate and hash OTP
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);

  // Create new verification session
  const sessionId = crypto.randomUUID();
  const expiresAt = now + OTP_TTL_SECONDS;
  const insertStmt = db.prepare(`
    INSERT INTO telegram_sessions (id, telegramIdentityId, otpHash, failedAttempts, maxAttempts, expiresAt, createdAt)
    VALUES (?, ?, ?, 0, ?, ?, ?)
  `);
  insertStmt.run(sessionId, identityId, otpHash, OTP_MAX_ATTEMPTS, expiresAt, now);

  // Update identity state
  updateIdentityEmail(db, identityId, email);

  // Send OTP via email
  const emailProvider = getEmailProvider();
  await emailProvider.sendEmail({
    to: email,
    subject: `Your verification code for ${tenantName}`,
    html: `
      <h1>Telegram Verification</h1>
      <p>Your one-time verification code is:</p>
      <h2 style="font-size: 32px; letter-spacing: 8px; font-family: monospace;">${otp}</h2>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not request this code, please ignore this email.</p>
    `,
    text: `Your Telegram verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this code, please ignore this email.`,
  });

  return { success: true, sessionId };
}

// --- OTP verification ---

function getActiveSession(
  db: Database,
  identityId: string
): TelegramSession | null {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    SELECT * FROM telegram_sessions
    WHERE telegramIdentityId = ? AND completedAt IS NULL AND expiresAt > ?
    ORDER BY createdAt DESC
    LIMIT 1
  `);
  return (stmt.get(identityId, now) as TelegramSession) ?? null;
}

export async function verifyOtp(
  db: Database,
  identityId: string,
  otpInput: string
): Promise<OtpVerifyResult> {
  const session = getActiveSession(db, identityId);

  if (!session) {
    return {
      success: false,
      error: "No active verification session. Please request a new code.",
    };
  }

  // Check if max attempts reached
  if (session.failedAttempts >= session.maxAttempts) {
    const now = Math.floor(Date.now() / 1000);
    const completeStmt = db.prepare(`
      UPDATE telegram_sessions SET completedAt = ? WHERE id = ?
    `);
    completeStmt.run(now, session.id);

    updateIdentityState(db, identityId, "awaiting_email");

    return {
      success: false,
      error: "Maximum verification attempts exceeded. Please restart verification with /start.",
      remainingAttempts: 0,
    };
  }

  // Verify OTP
  const inputHash = await hashOtp(otpInput);
  if (inputHash !== session.otpHash) {
    const newAttempts = session.failedAttempts + 1;
    const updateStmt = db.prepare(`
      UPDATE telegram_sessions SET failedAttempts = ? WHERE id = ?
    `);
    updateStmt.run(newAttempts, session.id);

    const remaining = session.maxAttempts - newAttempts;

    if (remaining <= 0) {
      const now = Math.floor(Date.now() / 1000);
      const completeStmt = db.prepare(`
        UPDATE telegram_sessions SET completedAt = ? WHERE id = ?
      `);
      completeStmt.run(now, session.id);

      updateIdentityState(db, identityId, "awaiting_email");

      return {
        success: false,
        error: "Maximum verification attempts exceeded. Please restart verification with /start.",
        remainingAttempts: 0,
      };
    }

    return {
      success: false,
      error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      remainingAttempts: remaining,
    };
  }

  // OTP is correct — mark session complete
  const now = Math.floor(Date.now() / 1000);
  const completeStmt = db.prepare(`
    UPDATE telegram_sessions SET completedAt = ? WHERE id = ?
  `);
  completeStmt.run(now, session.id);

  return { success: true };
}

// --- Link identity to backend user ---

export function linkIdentityToUser(
  db: Database,
  identityId: string,
  userId: string
): void {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    UPDATE telegram_identities
    SET userId = ?, verified = 1, state = 'verified', updatedAt = ?
    WHERE id = ?
  `);
  stmt.run(userId, now, identityId);
}

export function getUserByEmail(
  db: Database,
  email: string
): { id: string; email: string; name: string } | null {
  const stmt = db.prepare(`
    SELECT id, email, name FROM users WHERE email = ?
  `);
  return (stmt.get(email) as { id: string; email: string; name: string }) ?? null;
}

// --- Complete verification flow (OTP verify + link) ---

export async function completeVerification(
  db: Database,
  identityId: string,
  otpInput: string
): Promise<OtpVerifyResult> {
  const verifyResult = await verifyOtp(db, identityId, otpInput);
  if (!verifyResult.success) {
    return verifyResult;
  }

  // Look up identity to get email
  const identity = db.prepare(`SELECT * FROM telegram_identities WHERE id = ?`).get(identityId) as TelegramIdentity | undefined;
  if (!identity || !identity.email) {
    return { success: false, error: "Identity or email not found." };
  }

  // Find the backend user by email
  const user = getUserByEmail(db, identity.email);
  if (!user) {
    return {
      success: false,
      error: "No account found for this email. Please register first.",
    };
  }

  // Link identity
  linkIdentityToUser(db, identityId, user.id);

  return { success: true };
}
