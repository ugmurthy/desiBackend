import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const fakeDags = [
  { id: "dag_1", dagTitle: "Analyze sales data", status: "active", createdAt: "2024-06-01T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z", metadata: {} },
  { id: "dag_2", dagTitle: "Generate monthly report", status: "pending", createdAt: "2024-06-02T00:00:00Z", updatedAt: "2024-06-02T00:00:00Z", metadata: {} },
  { id: "dag_3", dagTitle: "Sales forecast pipeline", status: "active", createdAt: "2024-06-03T00:00:00Z", updatedAt: "2024-06-03T00:00:00Z", metadata: {} },
];

interface FakeScheduledDagRecord {
  id: string;
  dagTitle: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  metadata: {
    cronSchedule: string | null;
    scheduleActive: boolean;
    timezone: string;
  };
}

const SCHEDULE_UPDATE_TIME = "2024-06-10T00:00:00Z";

function createScheduledDagState(): FakeScheduledDagRecord[] {
  return [
    {
      id: "dag_1",
      dagTitle: "Analyze sales data",
      status: "active",
      createdAt: "2024-06-01T00:00:00Z",
      updatedAt: "2024-06-01T00:00:00Z",
      metadata: {
        cronSchedule: "0 9 * * 1",
        scheduleActive: false,
        timezone: "UTC",
      },
    },
    {
      id: "dag_2",
      dagTitle: "Generate monthly report",
      status: "pending",
      createdAt: "2024-06-02T00:00:00Z",
      updatedAt: "2024-06-02T00:00:00Z",
      metadata: {
        cronSchedule: "0 10 * * 2",
        scheduleActive: true,
        timezone: "America/New_York",
      },
    },
    {
      id: "dag_3",
      dagTitle: "Sales forecast pipeline",
      status: "active",
      createdAt: "2024-06-03T00:00:00Z",
      updatedAt: "2024-06-03T00:00:00Z",
      metadata: {
        cronSchedule: null,
        scheduleActive: false,
        timezone: "UTC",
      },
    },
    {
      id: "dag_unowned",
      dagTitle: "Finance sync",
      status: "active",
      createdAt: "2024-06-04T00:00:00Z",
      updatedAt: "2024-06-04T00:00:00Z",
      metadata: {
        cronSchedule: "0 6 * * *",
        scheduleActive: true,
        timezone: "UTC",
      },
    },
  ];
}

let scheduledDagState = createScheduledDagState();

function cloneScheduledDag(dag: FakeScheduledDagRecord): FakeScheduledDagRecord {
  return {
    ...dag,
    metadata: { ...dag.metadata },
  };
}

function findScheduledDag(id: string): FakeScheduledDagRecord | undefined {
  return scheduledDagState.find((candidate) => candidate.id === id);
}

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

function createValidationError(message: string): Error {
  const error = new Error(message);
  error.name = "ValidationError";
  return error;
}

function toggleScheduledDag(id: string, scheduleActive: boolean): FakeScheduledDagRecord {
  const dag = findScheduledDag(id);
  if (!dag) {
    throw createNotFoundError("DAG not found");
  }
  if (!dag.metadata.cronSchedule) {
    throw createValidationError(
      `Cannot ${scheduleActive ? "activate" : "deactivate"} schedule for DAG without a cron schedule`
    );
  }

  if (dag.metadata.scheduleActive !== scheduleActive) {
    dag.metadata.scheduleActive = scheduleActive;
    dag.updatedAt = SCHEDULE_UPDATE_TIME;
  }

  return cloneScheduledDag(dag);
}

vi.mock("@ugm/desiagent", () => ({
  setupDesiAgent: vi.fn(async () => ({
    version: "test",
    shutdown: vi.fn(),
    agents: {},
    dags: {
      list: vi.fn(async () => fakeDags),
      get: vi.fn(async (id: string) => {
        const dag = findScheduledDag(id);
        if (!dag) throw createNotFoundError("DAG not found");
        return cloneScheduledDag(dag);
      }),
      listScheduled: vi.fn(async () =>
        scheduledDagState
          .filter((dag) => dag.metadata.cronSchedule)
          .map((dag) => ({
            id: dag.id,
            dagTitle: dag.dagTitle,
            cronSchedule: dag.metadata.cronSchedule,
            scheduleDescription: `Schedule for ${dag.dagTitle}`,
            scheduleActive: dag.metadata.scheduleActive,
          }))
      ),
      activateSchedule: vi.fn(async (id: string) => toggleScheduledDag(id, true)),
      deactivateSchedule: vi.fn(async (id: string) => toggleScheduledDag(id, false)),
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

beforeEach(() => {
  scheduledDagState = createScheduledDagState();
});

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

describe("scheduled DAG routes", () => {
  it("lists only scheduled DAGs owned by the authenticated user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/dags/scheduled",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dags.map((dag: { id: string }) => dag.id).sort()).toEqual(["dag_1", "dag_2"]);
  });

  it("activates the schedule for an owned DAG", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/dags/scheduled",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        dagId: "dag_1",
        action: "activate",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe("dag_1");
    expect(body.scheduleActive).toBe(true);
    expect(body.cronSchedule).toBe("0 9 * * 1");
    expect(body.timezone).toBe("UTC");
    expect(body.updatedAt).toBe(SCHEDULE_UPDATE_TIME);
  });

  it("deactivates the schedule for an owned DAG", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/dags/scheduled",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        dagId: "dag_2",
        action: "deactivate",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe("dag_2");
    expect(body.scheduleActive).toBe(false);
    expect(body.updatedAt).toBe(SCHEDULE_UPDATE_TIME);
  });

  it("returns 400 when trying to activate a DAG without a cron schedule", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/dags/scheduled",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        dagId: "dag_3",
        action: "activate",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("without a cron schedule");
  });

  it("returns 403 when the DAG is not owned by the authenticated user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/dags/scheduled",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        dagId: "dag_unowned",
        action: "activate",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 404 when the DAG does not exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/dags/scheduled",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        dagId: "dag_missing",
        action: "activate",
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
