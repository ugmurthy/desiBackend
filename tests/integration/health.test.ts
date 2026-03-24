import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { ensureAdminDb } from "../helpers";

vi.mock("@ugm/desiagent", () => ({
  setupDesiAgent: vi.fn(async () => ({
    version: "test",
    shutdown: vi.fn(),
    agents: {},
    dags: {},
    executions: {},
    tools: {},
    skills: {},
  })),
  initDB: vi.fn(async () => ({ created: false, path: "" })),
  sendEmailTool: vi.fn(async () => ({ success: true })),
}));

vi.mock("../../src/services/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/services/email")>();
  return {
    ...original,
    sendVerificationEmail: vi.fn(async () => {}),
    sendPasswordResetEmail: vi.fn(async () => {}),
    sendInviteEmail: vi.fn(async () => {}),
  };
});

describe("Health endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ensureAdminDb();
    const { buildApp } = await import("../../src/app");
    app = await buildApp();
    app.log.level = "error";
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v2/health returns 200 with status ok", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/health",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("1.0.0");
    expect(typeof body.uptime).toBe("number");
  });

  it("GET /api/v2/health/ready returns 200 with database connected", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/health/ready",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.checks.database.status).toBe("connected");
  });
});
