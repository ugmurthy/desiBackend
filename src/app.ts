import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyEnv from "@fastify/env";
import { envSchema } from "./config/env";
import errorHandler from "./plugins/error-handler";
import healthRoutes from "./routes/v2/health";

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

  await app.register(errorHandler);

  await app.register(healthRoutes, { prefix: "/api/v2" });

  return app;
}
