import { Database } from "bun:sqlite";
import type { TelegramDispatchEventType } from "../db/telegram-schema";

// --- Idempotent dispatch helpers ---

/**
 * Check if a dispatch with the given idempotency key has already been sent.
 */
export function hasDispatched(db: Database, idempotencyKey: string): boolean {
  const row = db
    .prepare(
      "SELECT id FROM telegram_dispatch_log WHERE idempotencyKey = ?"
    )
    .get(idempotencyKey);
  return row !== null;
}

/**
 * Record a dispatch event in the audit log.
 * If an idempotency key is provided and already exists, the insert is skipped.
 */
export function recordDispatch(
  db: Database,
  params: {
    identityId: string;
    chatId: string;
    requestId?: string | null;
    eventType: TelegramDispatchEventType;
    idempotencyKey?: string | null;
    telegramMessageId?: string | null;
    payload?: string | null;
  }
): boolean {
  // Idempotency check: skip if already dispatched
  if (params.idempotencyKey && hasDispatched(db, params.idempotencyKey)) {
    return false;
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO telegram_dispatch_log
      (id, telegramIdentityId, chatId, requestId, eventType, idempotencyKey, telegramMessageId, payload, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.identityId,
    params.chatId,
    params.requestId ?? null,
    params.eventType,
    params.idempotencyKey ?? null,
    params.telegramMessageId ?? null,
    params.payload ?? null,
    now
  );

  return true;
}

// --- Idempotency key generators ---

export function onboardingKey(identityId: string): string {
  return `onboarding:${identityId}`;
}

export function requestAcceptedKey(requestId: string): string {
  return `request_accepted:${requestId}`;
}

export function clarificationKey(requestId: string, round: number): string {
  return `clarification:${requestId}:${round}`;
}

export function completionKey(requestId: string): string {
  return `completion:${requestId}`;
}

export function failureKey(requestId: string): string {
  return `failure:${requestId}`;
}

export function artifactDeliveryKey(
  requestId: string,
  artifactPath: string
): string {
  return `artifact:${requestId}:${artifactPath}`;
}

export function profileChangeKey(
  identityId: string,
  profileId: string
): string {
  return `profile_change:${identityId}:${profileId}`;
}

/**
 * Count clarification rounds for a request to generate unique idempotency keys.
 */
export function getClarificationRound(
  db: Database,
  requestId: string
): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM telegram_dispatch_log WHERE requestId = ? AND eventType = 'clarification'"
    )
    .get(requestId) as { count: number } | null;
  return (row?.count ?? 0) + 1;
}
