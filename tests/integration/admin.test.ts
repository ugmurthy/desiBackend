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
  createTestSuperAdmin,
} from "../helpers";
import type { FastifyInstance } from "fastify";
import type { Database } from "bun:sqlite";

let app: FastifyInstance;
let adminDb: Database;
let superAdminApiKey: string;
let regularApiKey: string;

beforeAll(async () => {
  adminDb = ensureAdminDb();
  const { adminApiKey } = await createTestSuperAdmin(adminDb);
  superAdminApiKey = adminApiKey;

  // Create a regular tenant user to verify non-admin access is rejected
  const tenant = await createTestTenant();
  regularApiKey = tenant.apiKey;

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("Admin auth guard", () => {
  it("GET /api/v2/admin/tenants without key returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/tenants",
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v2/admin/tenants without key returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/tenants",
      payload: { name: "Test", slug: "test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when using a regular user API key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/tenants",
      headers: { authorization: `Bearer ${regularApiKey}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/v2/admin/tenants", () => {
  it("returns tenant list with admin key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/tenants",
      headers: { authorization: `Bearer ${superAdminApiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tenants).toBeInstanceOf(Array);
    expect(body).toHaveProperty("total");
  });
});

describe("POST /api/v2/admin/tenants", () => {
  let createdTenantId: string;

  it("creates tenant and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/tenants",
      headers: { authorization: `Bearer ${superAdminApiKey}` },
      payload: { name: "Admin Test Tenant", slug: "admin-test-tenant" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Admin Test Tenant");
    expect(body.slug).toBe("admin-test-tenant");
    expect(body.id).toBeDefined();
    createdTenantId = body.id;
  });

  it("returns 409 with duplicate slug", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/tenants",
      headers: { authorization: `Bearer ${superAdminApiKey}` },
      payload: { name: "Duplicate", slug: "admin-test-tenant" },
    });

    expect(res.statusCode).toBe(409);
  });

  // Make the created ID available for later tests
  afterAll(() => {
    // Save for GET/PATCH/DELETE tests
    (globalThis as any).__adminTestTenantId = createdTenantId;
  });
});

describe("GET /api/v2/admin/tenants/:id", () => {
  it("returns tenant for valid id", async () => {
    const id = (globalThis as any).__adminTestTenantId;
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/tenants/${id}`,
      headers: { authorization: `Bearer ${superAdminApiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(id);
    expect(body.slug).toBe("admin-test-tenant");
  });

  it("returns 404 for non-existent id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/tenants/${crypto.randomUUID()}`,
      headers: { authorization: `Bearer ${superAdminApiKey}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/v2/admin/tenants/:id", () => {
  it("updates tenant name", async () => {
    const id = (globalThis as any).__adminTestTenantId;
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v2/admin/tenants/${id}`,
      headers: { authorization: `Bearer ${superAdminApiKey}` },
      payload: { name: "Updated Tenant Name" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe("Updated Tenant Name");
  });
});

describe("DELETE /api/v2/admin/tenants/:id", () => {
  it("suspends tenant when no action query (200)", async () => {
    // Create a tenant to suspend
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/tenants",
      headers: { authorization: `Bearer ${superAdminApiKey}` },
      payload: { name: "Suspend Me", slug: "suspend-me" },
    });
    const suspendId = createRes.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/admin/tenants/${suspendId}`,
      headers: { authorization: `Bearer ${superAdminApiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("suspended");
  });

  it("deletes tenant with action=delete (204)", async () => {
    // Create a tenant to delete
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/tenants",
      headers: { authorization: `Bearer ${superAdminApiKey}` },
      payload: { name: "Delete Me", slug: "delete-me" },
    });
    const deleteId = createRes.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/admin/tenants/${deleteId}?action=delete`,
      headers: { authorization: `Bearer ${superAdminApiKey}` },
    });

    expect(res.statusCode).toBe(204);
  });
});

describe("POST /api/v2/admin/bootstrap/:tenant", () => {
  it("creates tenant + admin + apikey (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/bootstrap/bootstrap-test",
      headers: { authorization: `Bearer ${superAdminApiKey}` },
      payload: {
        name: "Bootstrap Tenant",
        adminEmail: "bootstrap-admin@test.local",
        adminName: "Bootstrap Admin",
        plan: "free",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.tenant).toBeDefined();
    expect(body.tenant.slug).toBe("bootstrap-test");
    expect(body.admin).toBeDefined();
    expect(body.admin.email).toBe("bootstrap-admin@test.local");
    expect(body.admin.role).toBe("admin");
    expect(body.apiKey).toBeDefined();
    expect(body.apiKey.fullKey).toBeDefined();
  });

  it("returns 409 with duplicate slug", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/bootstrap/bootstrap-test",
      headers: { authorization: `Bearer ${superAdminApiKey}` },
      payload: {
        name: "Bootstrap Again",
        adminEmail: "another@test.local",
        adminName: "Another Admin",
      },
    });

    expect(res.statusCode).toBe(409);
  });
});
