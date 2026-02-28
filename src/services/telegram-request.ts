import type { Database } from "bun:sqlite";
import type { TelegramRequest, TelegramRequestState } from "../db/telegram-schema";

// --- Query helpers ---

export function getActiveRequest(
  db: Database,
  identityId: string
): TelegramRequest | null {
  const stmt = db.prepare(`
    SELECT * FROM telegram_requests
    WHERE telegramIdentityId = ? AND state IN ('pending', 'executing', 'awaiting_clarification')
    ORDER BY createdAt DESC
    LIMIT 1
  `);
  return (stmt.get(identityId) as TelegramRequest) ?? null;
}

export function hasActiveRequest(
  db: Database,
  identityId: string
): boolean {
  return getActiveRequest(db, identityId) !== null;
}

export function getRequestById(
  db: Database,
  requestId: string
): TelegramRequest | null {
  const stmt = db.prepare(`
    SELECT * FROM telegram_requests WHERE id = ?
  `);
  return (stmt.get(requestId) as TelegramRequest) ?? null;
}

// --- Mutation helpers ---

export function createRequest(
  db: Database,
  params: { identityId: string; chatId: string; profileId: string; requestText: string }
): TelegramRequest {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    INSERT INTO telegram_requests (id, telegramIdentityId, chatId, profileId, state, requestText, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  stmt.run(id, params.identityId, params.chatId, params.profileId, params.requestText, now, now);

  return {
    id,
    telegramIdentityId: params.identityId,
    chatId: params.chatId,
    profileId: params.profileId,
    dagId: null,
    executionId: null,
    state: "pending",
    requestText: params.requestText,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateRequestState(
  db: Database,
  requestId: string,
  state: TelegramRequestState
): void {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    UPDATE telegram_requests SET state = ?, updatedAt = ? WHERE id = ?
  `);
  stmt.run(state, now, requestId);
}

export function updateRequestExecution(
  db: Database,
  requestId: string,
  updates: { dagId?: string; executionId?: string; state?: TelegramRequestState }
): void {
  const now = Math.floor(Date.now() / 1000);
  const fields: string[] = ["updatedAt = ?"];
  const values: (string | number)[] = [now];

  if (updates.dagId !== undefined) {
    fields.push("dagId = ?");
    values.push(updates.dagId);
  }
  if (updates.executionId !== undefined) {
    fields.push("executionId = ?");
    values.push(updates.executionId);
  }
  if (updates.state !== undefined) {
    fields.push("state = ?");
    values.push(updates.state);
  }

  values.push(requestId);
  const stmt = db.prepare(`
    UPDATE telegram_requests SET ${fields.join(", ")} WHERE id = ?
  `);
  stmt.run(...values);
}
