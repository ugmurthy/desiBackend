import type { FastifyPluginAsync } from "fastify";
import { Database } from "bun:sqlite";
import { getTenantDbPath } from "../../db/user-schema";
import {
  handleTelegramUpdate,
  seedDefaultProfile,
  type TelegramUpdate,
} from "../../services/telegram-bot";

const telegramRoutes: FastifyPluginAsync = async (fastify) => {
  // Seed default profile on registration
  seedDefaultProfile();

  fastify.post<{ Body: TelegramUpdate }>(
    "/telegram/webhook",
    {
      schema: {
        tags: ["Telegram"],
        summary: "Telegram webhook endpoint",
        description: "Receives incoming updates from the Telegram Bot API",
        response: {
          200: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const botToken = fastify.config.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        request.log.warn("TELEGRAM_BOT_TOKEN not configured");
        return reply.status(200).send({ ok: true });
      }

      const tenantId = fastify.config.TELEGRAM_DEFAULT_TENANT_ID;
      const update = request.body;

      let tenantDb: Database | null = null;
      try {
        const dbPath = getTenantDbPath(tenantId);
        tenantDb = new Database(dbPath);

        // Resolve tenant name for OTP emails
        const tenantName = tenantId === "default" ? "desiAgent" : tenantId;

        await handleTelegramUpdate(
          tenantDb,
          botToken,
          tenantId,
          tenantName,
          update
        );
      } catch (err) {
        request.log.error(err, "Error processing Telegram update");
      } finally {
        tenantDb?.close();
      }

      return reply.status(200).send({ ok: true });
    }
  );
};

export default telegramRoutes;
