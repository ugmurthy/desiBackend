import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyEnv from "@fastify/env";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import scalarReference from "@scalar/fastify-api-reference";
import { envSchema } from "./config/env";
import errorHandler from "./plugins/error-handler";
import healthRoutes from "./routes/v2/health";
import authRoutes from "./routes/v2/auth";
import authSessionRoutes from "./routes/v2/auth-session";
import usersRoutes from "./routes/v2/users";
import agentsRoutes from "./routes/v2/agents";
import dagsRoutes from "./routes/v2/dags";
import executionsRoutes from "./routes/v2/executions";
import artifactsRoutes from "./routes/v2/artifacts";
import toolsRoutes from "./routes/v2/tools";
import costsRoutes from "./routes/v2/costs";
import billingRoutes from "./routes/v2/billing";
import adminRoutes from "./routes/v2/admin";
import { initializeTenantClientService } from "./services/tenant-client";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    ajv: {
      customOptions: {
        keywords: ["example"],
      },
    },
  });

  // Handle requests with Content-Type but empty body (common with DELETE requests)
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body || body === "") {
      done(null, undefined);
    } else {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
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

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "desiBackend API",
        description: "API for desiAgent backend services - multi-tenant agent orchestration platform",
        version: "2.0.0",
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Development server",
        },
      ],
      tags: [
        { name: "Health", description: "Health check endpoints" },
        { name: "Authentication", description: "Authentication and API key management" },
        { name: "Users", description: "User management endpoints" },
        { name: "Agents", description: "Agent configuration and management" },
        { name: "DAGs", description: "Directed Acyclic Graph management" },
        { name: "Executions", description: "Agent execution management" },
        { name: "Artifacts", description: "File artifacts from executions" },
        { name: "Tools", description: "Tool management endpoints" },
        { name: "Costs", description: "Cost tracking endpoints" },
        { name: "Billing", description: "Billing and usage endpoints" },
        { name: "Admin", description: "Administrative endpoints" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await app.register(scalarReference, {
    routePrefix: "/api/v2/docs",
    openApiDocumentEndpoints: {
      json: "/json",
      yaml: "/yaml",
    },
  });

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
  await app.register(authSessionRoutes, { prefix: "/api/v2" });
  await app.register(usersRoutes, { prefix: "/api/v2" });
  await app.register(agentsRoutes, { prefix: "/api/v2" });
  await app.register(dagsRoutes, { prefix: "/api/v2" });
  await app.register(executionsRoutes, { prefix: "/api/v2" });
  await app.register(artifactsRoutes, { prefix: "/api/v2" });
  await app.register(toolsRoutes, { prefix: "/api/v2" });
  await app.register(costsRoutes, { prefix: "/api/v2" });
  await app.register(billingRoutes, { prefix: "/api/v2" });
  await app.register(adminRoutes, { prefix: "/api/v2" });

  return app;
}
