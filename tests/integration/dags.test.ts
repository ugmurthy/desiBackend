import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Database } from "bun:sqlite";

const fakeDags = [
  { id: "dag_1", dagTitle: "Analyze sales data", status: "active", createdAt: "2024-06-01T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z", metadata: {} },
  { id: "dag_2", dagTitle: "Generate monthly report", status: "pending", createdAt: "2024-06-02T00:00:00Z", updatedAt: "2024-06-02T00:00:00Z", metadata: {} },
  { id: "dag_3", dagTitle: "Sales forecast pipeline", status: "active", createdAt: "2024-06-03T00:00:00Z", updatedAt: "2024-06-03T00:00:00Z", metadata: {} },
];

const fakeExecutions = [
  {
    id: "exec_sched_1",
    dagId: "dag_1",
    originalRequest: "Analyze sales data",
    primaryIntent: "analysis",
    status: "completed",
    totalTasks: 2,
    completedTasks: 2,
    failedTasks: 0,
    waitingTasks: 0,
    startedAt: "2024-06-01T00:00:00Z",
    completedAt: "2024-06-01T00:01:00Z",
    durationMs: 60000,
    createdAt: "2024-06-01T00:00:00Z",
    finalResult: { summary: "done" },
    synthesisResult: "done",
    suspendedReason: null,
    suspendedAt: null,
    retryCount: 0,
    totalUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    totalCostUsd: 0.01,
    updatedAt: "2024-06-01T00:01:00Z",
  },
  {
    id: "exec_sched_2",
    dagId: "dag_1",
    originalRequest: "Analyze sales data",
    primaryIntent: "analysis",
    status: "completed",
    totalTasks: 2,
    completedTasks: 2,
    failedTasks: 0,
    waitingTasks: 0,
    startedAt: "2024-06-02T00:00:00Z",
    completedAt: "2024-06-02T00:01:00Z",
    durationMs: 60000,
    createdAt: "2024-06-02T00:00:00Z",
    finalResult: { summary: "done again" },
    synthesisResult: "done again",
    suspendedReason: null,
    suspendedAt: null,
    retryCount: 0,
    totalUsage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
    totalCostUsd: 0.02,
    updatedAt: "2024-06-02T00:01:00Z",
  },
];

function createNotFoundError(message: string): Error {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}

vi.mock("@ugm/desiagent", () => ({
  setupDesiAgent: vi.fn(async () => ({
    version: "test",
    shutdown: vi.fn(),
    agents: {},
    dags: {
      list: vi.fn(async () => fakeDags),
      get: vi.fn(async (id: string) => {
        const dag = fakeDags.find((candidate) => candidate.id === id);
        if (!dag) throw createNotFoundError("DAG not found");
        return dag;
      }),
    },
    executions: {
      list: vi.fn(async (filter?: { dagId?: string }) => {
        if (filter?.dagId) {
          return fakeExecutions.filter((execution) => execution.dagId === filter.dagId);
        }
        return fakeExecutions;
      }),
      get: vi.fn(async (id: string) => {
        const execution = fakeExecutions.find((candidate) => candidate.id === id);
        if (!execution) throw createNotFoundError("Execution not found");
        return execution;
      }),
    },
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
import { ensureAdminDb, createTestTenant } from "../helpers";
import { insertResourceOwnership, checkResourceOwnership } from "../../src/db/user-schema";
import { Database as SqliteDatabase } from "bun:sqlite";
import { getTenantDbPath } from "../../src/db/user-schema";

let app: FastifyInstance;
let apiKey: string;
let tenantId: string;
let userId: string;

beforeAll(async () => {
  ensureAdminDb();
  const tenant = await createTestTenant();
  apiKey = tenant.apiKey;
  tenantId = tenant.tenantId;
  userId = tenant.userId;

  // Register ownership for all fake DAGs
  const db = new SqliteDatabase(getTenantDbPath(tenantId));
  for (const dag of fakeDags) {
    insertResourceOwnership(db, userId, "dag", dag.id);
  }
  db.close();

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/v2/dags search", () => {
  it("returns all owned DAGs when no search query", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/dags",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dags).toHaveLength(3);
    expect(body.pagination.total).toBe(3);
  });

  it("filters DAGs by search term (case-insensitive)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/dags?search=sales",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dags).toHaveLength(2);
    expect(body.dags.map((d: any) => d.id).sort()).toEqual(["dag_1", "dag_3"]);
    expect(body.pagination.total).toBe(2);
  });

  it("search is case-insensitive", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/dags?search=REPORT",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dags).toHaveLength(1);
    expect(body.dags[0].id).toBe("dag_2");
  });

  it("returns empty list when search matches nothing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/dags?search=nonexistent",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dags).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/dags?search=sales",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns executions for an owned DAG and backfills missing execution ownership", async () => {
    const executionId = fakeExecutions[0]?.id;
    expect(executionId).toBeDefined();

    const beforeOwnershipRes = await app.inject({
      method: "GET",
      url: `/api/v2/executions/${executionId}`,
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(beforeOwnershipRes.statusCode).toBe(403);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/dags/executions/dag_1",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dagId).toBe("dag_1");
    expect(body.executions).toHaveLength(2);
    expect(body.executions.map((execution: { id: string }) => execution.id)).toEqual([
      "exec_sched_1",
      "exec_sched_2",
    ]);

    const db = new SqliteDatabase(getTenantDbPath(tenantId));
    expect(checkResourceOwnership(db, userId, "execution", "exec_sched_1")).toBe(true);
    expect(checkResourceOwnership(db, userId, "execution", "exec_sched_2")).toBe(true);
    db.close();

    const afterOwnershipRes = await app.inject({
      method: "GET",
      url: `/api/v2/executions/${executionId}`,
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(afterOwnershipRes.statusCode).toBe(200);
  });
});
