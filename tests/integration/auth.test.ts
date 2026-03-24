import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { ensureAdminDb, createTestTenant } from "../helpers";

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

describe("Auth endpoints", () => {
  let app: FastifyInstance;
  let tenantId: string;
  let userId: string;
  let apiKey: string;
  let tenantSlug: string;

  beforeAll(async () => {
    ensureAdminDb();
    const tenant = await createTestTenant();
    tenantId = tenant.tenantId;
    userId = tenant.userId;
    apiKey = tenant.apiKey;
    tenantSlug = tenant.tenantSlug;

    const { buildApp } = await import("../../src/app");
    app = await buildApp();
    app.log.level = "error";
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // --- GET /auth/me ---

  it("GET /api/v2/auth/me without auth returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v2/auth/me with valid API key returns user info", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(userId);
    expect(body.email).toBe("user@test.local");
    expect(body.role).toBe("admin");
    expect(body.tenant).toBeDefined();
    expect(body.tenant.id).toBe(tenantId);
    expect(body.tenant.slug).toBe(tenantSlug);
  });

  it("GET /api/v2/auth/me with invalid Bearer token returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
      headers: { authorization: "Bearer desi_sk_invalid_token_here" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v2/auth/me without Bearer prefix returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
      headers: { authorization: apiKey },
    });

    expect(res.statusCode).toBe(401);
  });

  // --- GET /auth/api-keys ---

  it("GET /api/v2/auth/api-keys returns list of api keys", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/api-keys",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.apiKeys).toBeDefined();
    expect(Array.isArray(body.apiKeys)).toBe(true);
    expect(body.apiKeys.length).toBeGreaterThanOrEqual(1);
    expect(body.apiKeys[0]).toHaveProperty("id");
    expect(body.apiKeys[0]).toHaveProperty("name");
    expect(body.apiKeys[0]).toHaveProperty("keyPrefix");
  });

  // --- POST /auth/api-keys ---

  it("POST /api/v2/auth/api-keys creates a new api key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/auth/api-keys",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      payload: { name: "integration-test-key" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("integration-test-key");
    expect(body.key).toBeDefined();
    expect(body.key.startsWith("desi_sk_")).toBe(true);
    expect(body.id).toBeDefined();
    expect(body.keyPrefix).toBeDefined();
  });

  it("POST /api/v2/auth/api-keys without name returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/auth/api-keys",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  // --- DELETE /auth/api-keys/:id ---

  it("DELETE /api/v2/auth/api-keys/:id revokes key and returns 204", async () => {
    // Create a key to revoke
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/auth/api-keys",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      payload: { name: "key-to-revoke" },
    });

    const keyId = createRes.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/auth/api-keys/${keyId}`,
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it("DELETE /api/v2/auth/api-keys/:nonexistent returns 404", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/auth/api-keys/${crypto.randomUUID()}`,
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
