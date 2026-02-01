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
    LLM_PROVIDER: {
      type: "string" as const,
      default: "openai",
    },
    LLM_MODEL: {
      type: "string" as const,
      default: "gpt-4o-mini",
    },
    OPENAI_API_KEY: {
      type: "string" as const,
      default: "",
    },
    OPENROUTER_API_KEY: {
      type: "string" as const,
      default: "",
    },
    OLLAMA_BASE_URL: {
      type: "string" as const,
      default: "http://localhost:11434",
    },
    BASE_URL: {
      type: "string" as const,
      default: "http://localhost:3000",
    },
  },
};

export type EnvConfig = {
  PORT: number;
  HOST: string;
  NODE_ENV: string;
  LOG_LEVEL: string;
  LLM_PROVIDER: "openai" | "openrouter" | "ollama";
  LLM_MODEL: string;
  OPENAI_API_KEY: string;
  OPENROUTER_API_KEY: string;
  OLLAMA_BASE_URL: string;
  BASE_URL: string;
};

declare module "fastify" {
  interface FastifyInstance {
    config: EnvConfig;
  }
}
