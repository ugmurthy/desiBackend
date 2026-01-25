import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyEnv from "@fastify/env";
import rateLimit from "@fastify/rate-limit";
import { envSchema } from "./config/env";
import errorHandler from "./plugins/error-handler";
import healthRoutes from "./routes/v2/health";
import authRoutes from "./routes/v2/auth";
import usersRoutes from "./routes/v2/users";
import agentsRoutes from "./routes/v2/agents";
import dagsRoutes from "./routes/v2/dags";
import executionsRoutes from "./routes/v2/executions";
import toolsRoutes from "./routes/v2/tools";
import costsRoutes from "./routes/v2/costs";
import billingRoutes from "./routes/v2/billing";
import adminRoutes from "./routes/v2/admin";
import { initializeTenantClientService } from "./services/tenant-client";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(fastifyEnv, {
    confKey: "config",
    schema: envSchema,
    dotenv: true,
  });

  await app.register(cors, {
    origin: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const apiKey = authHeader.slice(7).trim();
        if (apiKey.startsWith("desi_sk_")) {
          return apiKey.slice(0, apiKey.indexOf("_", 10) + 1 + 8);
        }
      }
      return request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. You can make ${context.max} requests per ${context.after}. Please try again later.`,
    }),
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  });

  await app.register(errorHandler);

  initializeTenantClientService({
    llmProvider: app.config.LLM_PROVIDER,
    modelName: app.config.LLM_MODEL,
    openaiApiKey: app.config.OPENAI_API_KEY || undefined,
    openrouterApiKey: app.config.OPENROUTER_API_KEY || undefined,
    ollamaBaseUrl: app.config.OLLAMA_BASE_URL || undefined,
    logLevel: app.config.LOG_LEVEL as "debug" | "info" | "warn" | "error",
  });
  app.log.info(`TenantClientService initialized LOGLEVEL: ${app.config.LOG_LEVEL} : (provider: ${app.config.LLM_PROVIDER}, model: ${app.config.LLM_MODEL})`);

  await app.register(healthRoutes, { prefix: "/api/v2" });
  await app.register(authRoutes, { prefix: "/api/v2" });
  await app.register(usersRoutes, { prefix: "/api/v2" });
  await app.register(agentsRoutes, { prefix: "/api/v2" });
  await app.register(dagsRoutes, { prefix: "/api/v2" });
  await app.register(executionsRoutes, { prefix: "/api/v2" });
  await app.register(toolsRoutes, { prefix: "/api/v2" });
  await app.register(costsRoutes, { prefix: "/api/v2" });
  await app.register(billingRoutes, { prefix: "/api/v2" });
  await app.register(adminRoutes, { prefix: "/api/v2" });

  return app;
}
