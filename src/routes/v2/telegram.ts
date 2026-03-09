import type { FastifyPluginAsync } from "fastify";
import { join, dirname } from "path";
import { getTenantDbPath, initializeTenantUserSchema } from "../../db/user-schema";
import {
  handleTelegramUpdate,
  seedDefaultProfile,
  type TelegramUpdate,
} from "../../services/telegram-bot";
import { validateDownloadToken } from "../../services/telegram-polling";
import { checkRateLimit } from "../../services/telegram-rate-limit";
import { getTenantBySlug } from "../../services/admin";

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

      // US-012: Validate Telegram webhook secret token in production
      const webhookSecret = fastify.config.TELEGRAM_WEBHOOK_SECRET;
      if (webhookSecret) {
        const headerSecret = request.headers["x-telegram-bot-api-secret-token"];
        if (headerSecret !== webhookSecret) {
          request.log.warn("Invalid Telegram webhook secret token");
          return reply.status(200).send({ ok: true });
        }
      }

      const tenantSlug = fastify.config.TELEGRAM_DEFAULT_TENANT_ID;
      const update = request.body;

      // US-012: Rate limit per chat to prevent abuse
      const chatId = update.message?.chat?.id
        ? String(update.message.chat.id)
        : request.ip;
      const rl = checkRateLimit("webhook", chatId);
      if (!rl.allowed) {
        request.log.warn(`Telegram webhook rate limited for chat ${chatId}`);
        return reply.status(200).send({ ok: true });
      }

      // Resolve tenant slug to actual tenant ID
      const tenant = getTenantBySlug(tenantSlug);
      const tenantId = tenant?.id ?? tenantSlug;

      let tenantDb: import("bun:sqlite").Database | null = null;
      try {
        tenantDb = await initializeTenantUserSchema(tenantId);

        // Resolve tenant name for OTP emails
        const tenantName = tenant?.name ?? (tenantId === "default" ? "desiAgent" : tenantId);

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
  // US-010: Signed download endpoint for large artifacts
  fastify.get<{ Params: { token: string } }>(
    "/telegram/download/:token",
    {
      schema: {
        tags: ["Telegram"],
        summary: "Download artifact via signed token",
        description: "Serves a file artifact using a time-limited signed download token",
        params: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string" },
          },
        },
        response: {
          404: {
            type: "object",
            properties: {
              statusCode: { type: "number" },
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params;
      const result = validateDownloadToken(token);

      if (!result) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Download link expired or invalid",
        });
      }

      const dbPath = getTenantDbPath(result.tenantId);
      const artifactsDir = join(dirname(dbPath), "artifacts");
      const fullPath = join(artifactsDir, result.filePath);

      try {
        const file = Bun.file(fullPath);
        const exists = await file.exists();
        if (!exists) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "File not found",
          });
        }

        const stream = file.stream();
        reply.header("Content-Type", file.type || "application/octet-stream");
        reply.header(
          "Content-Disposition",
          `attachment; filename="${result.filePath.split("/").pop()}"`
        );
        return reply.send(stream);
      } catch {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "File not found",
        });
      }
    }
  );
};

export default telegramRoutes;
