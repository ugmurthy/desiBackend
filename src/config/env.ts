export const envSchema = {
  type: "object" as const,
  required: ["PORT"],
  properties: {
    PORT: {
      type: "number" as const,
      default: 3000,
    },
    HOST: {
      type: "string" as const,
      default: "0.0.0.0",
    },
    NODE_ENV: {
      type: "string" as const,
      default: "development",
    },
    LOG_LEVEL: {
      type: "string" as const,
      default: "info",
    },
  },
};

export type EnvConfig = {
  PORT: number;
  HOST: string;
  NODE_ENV: string;
  LOG_LEVEL: string;
};

declare module "fastify" {
  interface FastifyInstance {
    config: EnvConfig;
  }
}
