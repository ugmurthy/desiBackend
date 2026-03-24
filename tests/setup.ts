/**
 * Vitest global setup - initializes test environment.
 *
 * We set DESI_DATA_DIR to a tmp directory so that all SQLite databases
 * (admin + tenant) are created in isolation per test run and cleaned up.
 */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll } from "vitest";
import bcrypt from "bcrypt";

const testDataDir = mkdtempSync(join(tmpdir(), "desibackend-test-"));

// Must be set before any module reads DESI_DATA_DIR
process.env.DESI_DATA_DIR = testDataDir;

// Provide sensible defaults so fastify-env / app.ts don't fail
process.env.PORT = "0";
process.env.LLM_PROVIDER = "openai";
process.env.LLM_MODEL = "gpt-4o-mini";
process.env.OPENAI_API_KEY = "sk-test-fake-key";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "1025";
process.env.SMTP_USER = "test";
process.env.SMTP_PASS = "test";
process.env.SMTP_FROM = "test@test.com";

// Polyfill Bun.password for Node (used by src/utils/password.ts)
// Falls back to bcrypt with a compatible API surface.
if (typeof globalThis.Bun === "undefined") {
  (globalThis as any).Bun = {
    password: {
      hash: async (password: string, _opts?: unknown) => {
        return bcrypt.hash(password, 4);
      },
      verify: async (password: string, hash: string) => {
        return bcrypt.compare(password, hash);
      },
    },
  };
}

afterAll(() => {
  try {
    rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
