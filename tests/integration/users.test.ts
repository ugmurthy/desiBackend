import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

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

import { buildApp } from "../../src/app";
import {
  ensureAdminDb,
  createTestTenant,
  createTestUser,
  createApiKeyForUser,
} from "../helpers";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let adminApiKey: string;
let adminUserId: string;
let tenantId: string;
let memberUserId: string;
let memberApiKey: string;

beforeAll(async () => {
  ensureAdminDb();
  const tenant = await createTestTenant();
  tenantId = tenant.tenantId;
  adminUserId = tenant.userId;
  adminApiKey = tenant.apiKey;

  const member = createTestUser(tenantId, {
    email: "member@test.local",
    name: "Member User",
    role: "member",
  });
  memberUserId = member.userId;
  memberApiKey = await createApiKeyForUser(tenantId, memberUserId);

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/v2/users", () => {
  it("returns 200 and users array with admin key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/users",
      headers: { authorization: `Bearer ${adminApiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.users).toBeInstanceOf(Array);
    expect(body.users.length).toBeGreaterThanOrEqual(2);
  });

  it("returns 403 with member key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/users",
      headers: { authorization: `Bearer ${memberApiKey}` },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe("GET /api/v2/users/:id", () => {
  it("returns user details for valid id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/users/${memberUserId}`,
      headers: { authorization: `Bearer ${adminApiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(memberUserId);
    expect(body.email).toBe("member@test.local");
    expect(body.role).toBe("member");
  });

  it("returns 404 for non-existent id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/users/${crypto.randomUUID()}`,
      headers: { authorization: `Bearer ${adminApiKey}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/v2/users/:id", () => {
  it("updates role with admin key", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v2/users/${memberUserId}`,
      headers: { authorization: `Bearer ${adminApiKey}` },
      payload: { role: "viewer" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.role).toBe("viewer");

    // Reset back to member for subsequent tests
    await app.inject({
      method: "PATCH",
      url: `/api/v2/users/${memberUserId}`,
      headers: { authorization: `Bearer ${adminApiKey}` },
      payload: { role: "member" },
    });
  });

  it("returns 403 with member key", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v2/users/${memberUserId}`,
      headers: { authorization: `Bearer ${memberApiKey}` },
      payload: { role: "viewer" },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /api/v2/users/:id", () => {
  it("deletes member user with admin key (204)", async () => {
    // Create a disposable user to delete
    const disposable = createTestUser(tenantId, {
      email: "disposable@test.local",
      name: "Disposable User",
      role: "member",
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/users/${disposable.userId}`,
      headers: { authorization: `Bearer ${adminApiKey}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it("returns 400 when admin tries to delete self", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/users/${adminUserId}`,
      headers: { authorization: `Bearer ${adminApiKey}` },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain("Cannot delete your own");
  });
});

describe("POST /api/v2/users/invite", () => {
  it("creates new user with given role", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/users/invite",
      headers: { authorization: `Bearer ${adminApiKey}` },
      payload: {
        email: "invited@test.local",
        name: "Invited User",
        role: "viewer",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.email).toBe("invited@test.local");
    expect(body.name).toBe("Invited User");
    expect(body.role).toBe("viewer");
    expect(body.id).toBeDefined();
  });

  it("returns 409 with duplicate email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/users/invite",
      headers: { authorization: `Bearer ${adminApiKey}` },
      payload: {
        email: "invited@test.local",
        name: "Duplicate User",
      },
    });

    expect(res.statusCode).toBe(409);
  });
});
