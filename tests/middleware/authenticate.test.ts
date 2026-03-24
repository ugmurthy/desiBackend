import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { Database } from "bun:sqlite";
import bcrypt from "bcrypt";
import {
  ensureAdminDb,
  createTestTenant,
  createTestUser,
  createApiKeyForUser,
} from "../helpers";

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

let app: FastifyInstance;
let tenantId: string;
let userId: string;
let apiKey: string;

beforeAll(async () => {
  ensureAdminDb();
  const tenant = await createTestTenant();
  tenantId = tenant.tenantId;
  userId = tenant.userId;
  apiKey = tenant.apiKey;

  const { buildApp } = await import("../../src/app");
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("authenticate middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Missing Authorization header");
  });

  it("returns 401 when Authorization header lacks Bearer prefix", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
      headers: { authorization: apiKey },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toContain("Invalid Authorization header format");
  });

  it("returns 401 for an invalid API key", async () => {
    const fakeKey = "desi_sk_live_" + crypto.randomUUID().replace(/-/g, "");
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
      headers: { authorization: `Bearer ${fakeKey}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with user info for a valid API key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("id", userId);
    expect(body).toHaveProperty("email");
    expect(body).toHaveProperty("tenant");
    expect(body.tenant).toHaveProperty("id", tenantId);
  });

  it("returns 401 for an expired API key", async () => {
    const { getTenantDbPath } = await import("../../src/db/user-schema");

    const tenantDbPath = getTenantDbPath(tenantId);
    const db = new Database(tenantDbPath);

    const expiredKey =
      "desi_sk_live_expired" + crypto.randomUUID().replace(/-/g, "");
    const keyPrefix = expiredKey.slice(
      0,
      expiredKey.indexOf("_", 10) + 1 + 8
    );
    const keyHash = await bcrypt.hash(expiredKey, 4);
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    db.prepare(
      "INSERT INTO api_keys (id, userId, name, keyPrefix, keyHash, scopes, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      crypto.randomUUID(),
      userId,
      "expired",
      keyPrefix,
      keyHash,
      '["read"]',
      pastDate,
      pastDate
    );

    const adminDb = ensureAdminDb();
    adminDb
      .prepare(
        "INSERT OR REPLACE INTO api_key_tenant_map (keyPrefix, tenantId) VALUES (?, ?)"
      )
      .run(keyPrefix, tenantId);

    db.close();

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/auth/me",
      headers: { authorization: `Bearer ${expiredKey}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when a viewer accesses an admin-only route", async () => {
    const { userId: viewerId } = createTestUser(tenantId, {
      role: "viewer",
      email: `viewer-${crypto.randomUUID().slice(0, 6)}@test.local`,
    });
    const viewerKey = await createApiKeyForUser(tenantId, viewerId);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/users",
      headers: { authorization: `Bearer ${viewerKey}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain("roles");
  });
});
