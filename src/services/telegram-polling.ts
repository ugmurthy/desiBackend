import { Database } from "bun:sqlite";
import { stat } from "fs/promises";
import { join, dirname, basename } from "path";
import { getTenantDbPath } from "../db/user-schema";
import { updateRequestState } from "./telegram-request";
import { getTenantClientService } from "./tenant-client";
import { getExecutionArtifacts } from "./telegram-artifacts";
import {
  recordDispatch,
  hasDispatched,
  completionKey,
  failureKey,
  artifactDeliveryKey,
} from "./telegram-dispatch";

// Environment-driven polling configuration
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 300000; // 5 minutes

function getPollConfig() {
  return {
    intervalMs: Number(process.env.TELEGRAM_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: Number(process.env.TELEGRAM_POLL_TIMEOUT_MS) || DEFAULT_POLL_TIMEOUT_MS,
  };
}

// Telegram file size limit: 50 MB
const TELEGRAM_FILE_SIZE_LIMIT = 50 * 1024 * 1024;

// Signed download tokens: token → { tenantId, filePath, expiresAt }
const downloadTokens = new Map<
  string,
  { tenantId: string; filePath: string; expiresAt: number }
>();
const DOWNLOAD_TOKEN_TTL_MS = 3600_000; // 1 hour

export function validateDownloadToken(
  token: string
): { tenantId: string; filePath: string } | null {
  const entry = downloadTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    downloadTokens.delete(token);
    return null;
  }
  return { tenantId: entry.tenantId, filePath: entry.filePath };
}

function generateDownloadToken(tenantId: string, filePath: string): string {
  const token = crypto.randomUUID();
  downloadTokens.set(token, {
    tenantId,
    filePath,
    expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS,
  });
  return token;
}

function getArtifactsDir(tenantId: string): string {
  const dbPath = getTenantDbPath(tenantId);
  return join(dirname(dbPath), "artifacts");
}

async function sendMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

async function sendDocument(
  botToken: string,
  chatId: string,
  filePath: string,
  caption?: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
  const file = Bun.file(filePath);
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", file, basename(filePath));
  if (caption) {
    formData.append("caption", caption);
    formData.append("parse_mode", "Markdown");
  }
  await fetch(url, { method: "POST", body: formData });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function deliverArtifacts(
  botToken: string,
  chatId: string,
  tenantId: string,
  executionId: string
): Promise<void> {
  const artifacts = await getExecutionArtifacts(tenantId, executionId);
  if (artifacts.length === 0) return;

  // Send concise summary
  const summary = artifacts.map((a) => `• \`${basename(a.path)}\` (${a.toolName})`).join("\n");
  await sendMessage(
    botToken,
    chatId,
    `📎 *Artifacts from execution:*\n\n${summary}`
  );

  const artifactsDir = getArtifactsDir(tenantId);
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  for (const artifact of artifacts) {
    const fullPath = join(artifactsDir, artifact.path);
    try {
      const fileStat = await stat(fullPath);

      if (fileStat.size <= TELEGRAM_FILE_SIZE_LIMIT) {
        await sendDocument(botToken, chatId, fullPath, `📄 \`${basename(artifact.path)}\``);
      } else {
        // File exceeds Telegram limit — send signed download link
        const token = generateDownloadToken(tenantId, artifact.path);
        const downloadUrl = `${baseUrl}/api/v2/telegram/download/${token}`;
        await sendMessage(
          botToken,
          chatId,
          `📦 \`${basename(artifact.path)}\` is too large for Telegram (${formatFileSize(fileStat.size)}).\n\n[Download link](${downloadUrl}) _(expires in 1 hour)_`
        );
      }
    } catch {
      // File might not exist on disk — skip silently
    }
  }
}

export interface PollParams {
  botToken: string;
  tenantId: string;
  chatId: string;
  requestId: string;
  executionId: string;
  identityId?: string;
}

export function startExecutionPolling(params: PollParams): void {
  const config = getPollConfig();
  const startTime = Date.now();

  async function poll(): Promise<void> {
    if (Date.now() - startTime > config.timeoutMs) {
      const db = new Database(getTenantDbPath(params.tenantId));
      try {
        updateRequestState(db, params.requestId, "failed");
      } finally {
        db.close();
      }
      await sendMessage(
        params.botToken,
        params.chatId,
        `⏰ Execution monitoring timed out.\n\n🔹 Execution: \`${params.executionId}\``
      );
      return;
    }

    try {
      const client = await getTenantClientService().getClient(params.tenantId);
      const execution = await client.executions.get(params.executionId);
      const status = (execution as unknown as { status: string }).status;

      if (status === "completed" || status === "failed") {
        const db = new Database(getTenantDbPath(params.tenantId));
        try {
          updateRequestState(
            db,
            params.requestId,
            status === "completed" ? "completed" : "failed"
          );

          // US-011: Idempotent dispatch — skip if already sent
          const idemKey =
            status === "completed"
              ? completionKey(params.requestId)
              : failureKey(params.requestId);
          const alreadySent = hasDispatched(db, idemKey);

          if (!alreadySent) {
            if (status === "completed") {
              await sendMessage(
                params.botToken,
                params.chatId,
                `✅ Execution completed!\n\n🔹 Execution: \`${params.executionId}\``
              );
            } else {
              await sendMessage(
                params.botToken,
                params.chatId,
                `❌ Execution failed.\n\n🔹 Execution: \`${params.executionId}\``
              );
            }

            // Record dispatch for audit and idempotency
            if (params.identityId) {
              recordDispatch(db, {
                identityId: params.identityId,
                chatId: params.chatId,
                requestId: params.requestId,
                eventType: status === "completed" ? "completion" : "failure",
                idempotencyKey: idemKey,
                payload: JSON.stringify({ executionId: params.executionId }),
              });
            }
          }
        } finally {
          db.close();
        }

        // US-010: Deliver artifacts on completion
        if (status === "completed") {
          try {
            await deliverArtifacts(
              params.botToken,
              params.chatId,
              params.tenantId,
              params.executionId
            );
          } catch {
            // Artifact delivery failure should not break the flow
          }
        }
        return;
      }

      // Non-terminal state: continue polling
      setTimeout(poll, config.intervalMs);
    } catch {
      // Transient error, retry on next interval
      setTimeout(poll, config.intervalMs);
    }
  }

  // Start first poll after one interval
  setTimeout(poll, config.intervalMs);
}
