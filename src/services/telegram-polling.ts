import { Database } from "bun:sqlite";
import { getTenantDbPath } from "../db/user-schema";
import { updateRequestState } from "./telegram-request";
import { getTenantClientService } from "./tenant-client";

// Environment-driven polling configuration
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 300000; // 5 minutes

function getPollConfig() {
  return {
    intervalMs: Number(process.env.TELEGRAM_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: Number(process.env.TELEGRAM_POLL_TIMEOUT_MS) || DEFAULT_POLL_TIMEOUT_MS,
  };
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

export interface PollParams {
  botToken: string;
  tenantId: string;
  chatId: string;
  requestId: string;
  executionId: string;
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
        } finally {
          db.close();
        }

        const msg =
          status === "completed"
            ? `✅ Execution completed!\n\n🔹 Execution: \`${params.executionId}\``
            : `❌ Execution failed.\n\n🔹 Execution: \`${params.executionId}\``;

        await sendMessage(params.botToken, params.chatId, msg);
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
