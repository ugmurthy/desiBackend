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

let app: FastifyInstance;
let tenantId: string;
let apiKey: string;

beforeAll(async () => {
  ensureAdminDb();
  const tenant = await createTestTenant();
  tenantId = tenant.tenantId;
  apiKey = tenant.apiKey;

  const { trackExecutionUsage } = await import("../../src/services/billing");
  trackExecutionUsage(
    tenantId,
    "exec-test-1",
    "dag-test-1",
    "gpt-4o-mini",
    3000,
    2000,
    1500
  );

  const { buildApp } = await import("../../src/app");
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("billing routes", () => {
  describe("GET /api/v2/billing/usage", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v2/billing/usage",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 200 with usage/costs/quotas structure", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v2/billing/usage",
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("tenantId", tenantId);
      expect(body).toHaveProperty("period");
      expect(body.period).toHaveProperty("start");
      expect(body.period).toHaveProperty("end");
      expect(body).toHaveProperty("usage");
      expect(body.usage).toHaveProperty("totalTokens");
      expect(body.usage).toHaveProperty("computeTimeMs");
      expect(body.usage).toHaveProperty("totalExecutions");
      expect(body.usage).toHaveProperty("totalDags");
      expect(body).toHaveProperty("costs");
      expect(body.costs).toHaveProperty("tokenCost");
      expect(body.costs).toHaveProperty("computeCost");
      expect(body.costs).toHaveProperty("totalCost");
      expect(body).toHaveProperty("quotas");
    });
  });

  describe("GET /api/v2/billing/usage/history", () => {
    it("returns paginated usage records", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v2/billing/usage/history",
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("tenantId", tenantId);
      expect(body).toHaveProperty("records");
      expect(Array.isArray(body.records)).toBe(true);
      expect(body).toHaveProperty("summary");
      expect(body.summary).toHaveProperty("byResourceType");
      expect(body.summary).toHaveProperty("totalCost");
      expect(body).toHaveProperty("pagination");
      expect(body.pagination).toHaveProperty("total");
      expect(body.pagination).toHaveProperty("limit");
      expect(body.pagination).toHaveProperty("offset");
      expect(body.pagination).toHaveProperty("hasMore");
    });
  });

  describe("GET /api/v2/billing/invoices", () => {
    it("returns empty invoices array initially", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v2/billing/invoices",
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("tenantId", tenantId);
      expect(body).toHaveProperty("invoices");
      expect(body.invoices).toEqual([]);
      expect(body).toHaveProperty("pagination");
    });
  });

  describe("GET /api/v2/billing/invoices/:id", () => {
    it("returns 404 for non-existent invoice", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v2/billing/invoices/inv_nonexistent",
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain("inv_nonexistent");
    });
  });
});
