import type { FastifyPluginAsync } from "fastify";
import { authenticate, ensureRole } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";
import { getUsage, getUsageSummary, type DateRange } from "../../services/billing";
import type { UsageMetadata } from "../../db/billing-schema";
import { getOwnedResourceIds } from "../../db/user-schema";
import { error401SchemaExamples, errorResponseSchemaExamples } from "./schemas";

interface ExecutionIdParams {
  id: string;
}

interface DagIdParams {
  id: string;
}

interface CostSummaryQuery {
  startDate?: string;
  endDate?: string;
}

const costsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: ExecutionIdParams }>(
    "/costs/executions/:id",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Costs"],
        summary: "Get execution cost details",
        description: "Retrieves detailed cost and usage information for a specific execution, including token usage, compute time, and associated costs.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "Execution ID", examples: ["exec_abc123"] },
          },
        },
        response: {
          200: {
            type: "object",
            description: "Execution cost details",
            properties: {
              executionId: { type: "string", examples: ["exec_abc123"] },
              dagId: { type: "string", examples: ["dag_xyz789"] },
              status: { type: "string", examples: ["completed"] },
              usage: {
                type: "object",
                properties: {
                  totalTokens: { type: "number", examples: [15000] },
                  inputTokens: { type: "number", examples: [10000] },
                  outputTokens: { type: "number", examples: [5000] },
                  computeTimeMs: { type: "number", examples: [12500] },
                },
              },
              costs: {
                type: "object",
                properties: {
                  tokenCost: { type: "number", examples: [0.045] },
                  computeCost: { type: "number", examples: [0.012] },
                  totalCost: { type: "number", examples: [0.057] },
                },
              },
              model: { type: ["string", "null"], examples: ["gpt-4"] },
              startedAt: { type: "string", format: "date-time", examples: ["2024-01-15T10:30:00Z"] },
              completedAt: { type: ["string", "null"], format: "date-time", examples: ["2024-01-15T10:32:00Z"] },
              durationMs: { type: ["number", "null"], examples: [120000] },
            },
          },
          401: error401SchemaExamples,
          404: errorResponseSchemaExamples(404, "Execution not found", "Execution not found"),
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const execution = await client.executions.get(id);

        const usageRecords = getUsage(auth.tenant.id);
        const executionUsage = usageRecords.filter((record) => {
          const metadata: UsageMetadata = JSON.parse(record.metadata);
          return metadata.executionId === id;
        });

        const tokenRecords = executionUsage.filter((r) => r.resourceType === "tokens");
        const computeRecords = executionUsage.filter((r) => r.resourceType === "compute_time");

        const totalTokens = tokenRecords.reduce((sum, r) => sum + r.quantity, 0);
        const totalTokenCost = tokenRecords.reduce((sum, r) => sum + r.unitCost, 0);
        const totalComputeTimeMs = computeRecords.reduce((sum, r) => sum + r.quantity, 0);
        const totalComputeCost = computeRecords.reduce((sum, r) => sum + r.unitCost, 0);

        const firstTokenRecordData = tokenRecords[0];
        const firstTokenRecord = firstTokenRecordData ? JSON.parse(firstTokenRecordData.metadata) as UsageMetadata : null;

        const tokenCostNum = Number(totalTokenCost) || Number(execution.totalCostUsd) || 0;
        const computeCostNum = Number(totalComputeCost);

        return {
          executionId: id,
          dagId: execution.dagId,
          status: execution.status,
          usage: {
            totalTokens,
            inputTokens: firstTokenRecord?.inputTokens ?? execution.totalUsage?.promptTokens ?? 0,
            outputTokens: firstTokenRecord?.outputTokens ?? execution.totalUsage?.completionTokens ?? 0,
            computeTimeMs: totalComputeTimeMs || execution.durationMs || 0,
          },
          costs: {
            tokenCost: tokenCostNum,
            computeCost: computeCostNum,
            totalCost: tokenCostNum + computeCostNum,
          },
          model: firstTokenRecord?.model ?? null,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          durationMs: execution.durationMs,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Execution not found",
          });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Params: DagIdParams }>(
    "/costs/dags/:id",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Costs"],
        summary: "Get DAG cost details",
        description: "Retrieves aggregated cost and usage information for a DAG, including totals across all executions and per-execution breakdown.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "DAG ID", examples: ["dag_xyz789"] },
          },
        },
        response: {
          200: {
            type: "object",
            description: "DAG cost details",
            properties: {
              dagId: { type: "string", examples: ["dag_xyz789"] },
              objective: { type: "string", examples: ["Process customer data"] },
              totalExecutions: { type: "number", examples: [5] },
              usage: {
                type: "object",
                properties: {
                  totalTokens: { type: "number", examples: [75000] },
                  computeTimeMs: { type: "number", examples: [62500] },
                },
              },
              costs: {
                type: "object",
                properties: {
                  tokenCost: { type: "number", examples: [0.225] },
                  computeCost: { type: "number", examples: [0.06] },
                  totalCost: { type: "number", examples: [0.285] },
                },
              },
              executions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    executionId: { type: "string", examples: ["exec_abc123"] },
                    status: { type: "string", examples: ["completed"] },
                    totalCost: { type: "number", examples: [0.057] },
                    startedAt: { type: "string", format: "date-time", examples: ["2024-01-15T10:30:00Z"] },
                    completedAt: { type: ["string", "null"], format: "date-time", examples: ["2024-01-15T10:32:00Z"] },
                  },
                },
              },
              createdAt: { type: "string", format: "date-time", examples: ["2024-01-10T08:00:00Z"] },
            },
          },
          401: error401SchemaExamples,
          404: errorResponseSchemaExamples(404, "DAG not found", "DAG not found"),
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const dag = await client.dags.get(id);

        const executions = await client.executions.list({ dagId: id });

        const usageRecords = getUsage(auth.tenant.id);
        const dagUsage = usageRecords.filter((record) => {
          const metadata: UsageMetadata = JSON.parse(record.metadata);
          return metadata.dagId === id;
        });

        const tokenRecords = dagUsage.filter((r) => r.resourceType === "tokens");
        const computeRecords = dagUsage.filter((r) => r.resourceType === "compute_time");

        const totalTokens = tokenRecords.reduce((sum, r) => sum + r.quantity, 0);
        const totalTokenCost = tokenRecords.reduce((sum, r) => sum + r.unitCost, 0);
        const totalComputeTimeMs = computeRecords.reduce((sum, r) => sum + r.quantity, 0);
        const totalComputeCost = computeRecords.reduce((sum, r) => sum + r.unitCost, 0);

        const executionSummary = executions.map((exec) => {
          const execUsage = dagUsage.filter((record) => {
            const metadata: UsageMetadata = JSON.parse(record.metadata);
            return metadata.executionId === exec.id;
          });
          const execTokenCost = execUsage
            .filter((r) => r.resourceType === "tokens")
            .reduce((sum, r) => sum + Number(r.unitCost), 0);
          const execComputeCost = execUsage
            .filter((r) => r.resourceType === "compute_time")
            .reduce((sum, r) => sum + Number(r.unitCost), 0);

          const tokenCostNum = execTokenCost || Number(exec.totalCostUsd) || 0;
          return {
            executionId: exec.id,
            status: exec.status,
            totalCost: tokenCostNum + execComputeCost,
            startedAt: exec.startedAt,
            completedAt: exec.completedAt,
          };
        });

        const fallbackTokenCost = executions.reduce((sum, e) => sum + (Number(e.totalCostUsd) || 0), 0);

        const totalTokenCostNum = Number(totalTokenCost) || fallbackTokenCost;
        const totalComputeCostNum = Number(totalComputeCost);

        return {
          dagId: id,
          objective: dag.objective,
          totalExecutions: executions.length,
          usage: {
            totalTokens,
            computeTimeMs: totalComputeTimeMs,
          },
          costs: {
            tokenCost: totalTokenCostNum,
            computeCost: totalComputeCostNum,
            totalCost: totalTokenCostNum + totalComputeCostNum,
          },
          executions: executionSummary,
          createdAt: dag.createdAt,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "DAG not found",
          });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Querystring: CostSummaryQuery }>(
    "/costs/summary",
    {
      preHandler: [authenticate, ensureRole("admin")],
      schema: {
        tags: ["Costs"],
        summary: "Get overall cost summary (admin only)",
        description: "Retrieves an aggregated cost summary for the tenant, including usage breakdown by resource type and model. Supports optional date range filtering. Requires admin role.",
        querystring: {
          type: "object",
          properties: {
            startDate: { type: "string", format: "date", description: "Start date for filtering (inclusive)", examples: ["2024-01-01"] },
            endDate: { type: "string", format: "date", description: "End date for filtering (inclusive)", examples: ["2024-01-31"] },
          },
        },
        response: {
          200: {
            type: "object",
            description: "Cost summary",
            properties: {
              tenantId: { type: "string", examples: ["tenant_123"] },
              period: {
                type: "object",
                properties: {
                  startDate: { type: ["string", "null"], examples: ["2024-01-01"] },
                  endDate: { type: ["string", "null"], examples: ["2024-01-31"] },
                },
              },
              usage: {
                type: "object",
                properties: {
                  totalTokens: { type: "number", examples: [500000] },
                  computeTimeMs: { type: "number", examples: [300000] },
                },
              },
              costs: {
                type: "object",
                properties: {
                  tokenCost: { type: "number", examples: [1.5] },
                  computeCost: { type: "number", examples: [0.3] },
                  totalCost: { type: "number", examples: [1.8] },
                },
              },
              breakdown: {
                type: "object",
                properties: {
                  byResourceType: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        resourceType: { type: "string", examples: ["tokens"] },
                        quantity: { type: "number", examples: [500000] },
                        cost: { type: "number", examples: [1.5] },
                      },
                    },
                  },
                  byModel: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        model: { type: "string", examples: ["gpt-4"] },
                        tokens: { type: "number", examples: [300000] },
                        cost: { type: "number", examples: [0.9] },
                      },
                    },
                  },
                },
              },
            },
          },
          401: error401SchemaExamples,
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { startDate, endDate } = request.query;

      let dateRange: DateRange | undefined;
      if (startDate && endDate) {
        dateRange = {
          start: startDate,
          end: endDate,
        };
      }

      const usageSummary = getUsageSummary(auth.tenant.id, dateRange);
      const usageRecords = getUsage(auth.tenant.id, dateRange);

      const tokenSummary = usageSummary.find((s) => s.resourceType === "tokens");
      const computeSummary = usageSummary.find((s) => s.resourceType === "compute_time");

      const models = new Map<string, { tokens: number; cost: number }>();
      usageRecords
        .filter((r) => r.resourceType === "tokens")
        .forEach((record) => {
          const metadata: UsageMetadata = JSON.parse(record.metadata);
          if (metadata.model) {
            const existing = models.get(metadata.model) || { tokens: 0, cost: 0 };
            models.set(metadata.model, {
              tokens: existing.tokens + record.quantity,
              cost: existing.cost + record.unitCost,
            });
          }
        });

      let totalTokens = tokenSummary?.totalQuantity ?? 0;
      let totalComputeTimeMs = computeSummary?.totalQuantity ?? 0;
      let tokenCost = tokenSummary?.totalCost ?? 0;
      let computeCost = computeSummary?.totalCost ?? 0;
      let resourceTypeBreakdown = usageSummary.map((s) => ({
        resourceType: s.resourceType,
        quantity: s.totalQuantity,
        cost: s.totalCost,
      }));

      if (usageSummary.length === 0) {
        const clientService = getTenantClientService();
        const client = await clientService.getClient(auth.tenant.id);
        const executions = await client.executions.list();

        const filteredExecutions = dateRange
          ? executions.filter((exec) => {
              if (!exec.startedAt) return false;
              const execDate = new Date(exec.startedAt).toISOString().split("T")[0] as string;
              return execDate >= dateRange.start && execDate <= dateRange.end;
            })
          : executions;

        for (const exec of filteredExecutions) {
          const execTokens = (exec.totalUsage?.promptTokens ?? 0) + (exec.totalUsage?.completionTokens ?? 0);
          totalTokens += execTokens;
          totalComputeTimeMs += exec.durationMs ?? 0;
          tokenCost += Number(exec.totalCostUsd) || 0;
        }

        if (totalTokens > 0 || tokenCost > 0) {
          resourceTypeBreakdown.push({
            resourceType: "tokens",
            quantity: totalTokens,
            cost: tokenCost,
          });
        }
        if (totalComputeTimeMs > 0) {
          resourceTypeBreakdown.push({
            resourceType: "compute_time",
            quantity: totalComputeTimeMs,
            cost: computeCost,
          });
        }
      }

      const modelBreakdown = Array.from(models.entries()).map(([model, data]) => ({
        model,
        tokens: data.tokens,
        cost: data.cost,
      }));

      const totalCost = tokenCost + computeCost;

      return {
        tenantId: auth.tenant.id,
        period: {
          startDate: dateRange?.start ?? null,
          endDate: dateRange?.end ?? null,
        },
        usage: {
          totalTokens,
          computeTimeMs: totalComputeTimeMs,
        },
        costs: {
          tokenCost,
          computeCost,
          totalCost,
        },
        breakdown: {
          byResourceType: resourceTypeBreakdown,
          byModel: modelBreakdown,
        },
      };
    }
  );

  fastify.get<{ Querystring: CostSummaryQuery }>(
    "/costs/summary/me",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Costs"],
        summary: "Get cost summary for the authenticated user",
        description: "Retrieves an aggregated cost summary for the authenticated user, scoped to executions they own. Supports optional date range filtering.",
        querystring: {
          type: "object",
          properties: {
            startDate: { type: "string", format: "date", description: "Start date for filtering (inclusive)", examples: ["2024-01-01"] },
            endDate: { type: "string", format: "date", description: "End date for filtering (inclusive)", examples: ["2024-01-31"] },
          },
        },
        response: {
          200: {
            type: "object",
            description: "User cost summary",
            properties: {
              userId: { type: "string", examples: ["user_123"] },
              tenantId: { type: "string", examples: ["tenant_123"] },
              period: {
                type: "object",
                properties: {
                  startDate: { type: ["string", "null"], examples: ["2024-01-01"] },
                  endDate: { type: ["string", "null"], examples: ["2024-01-31"] },
                },
              },
              usage: {
                type: "object",
                properties: {
                  totalTokens: { type: "number", examples: [500000] },
                  computeTimeMs: { type: "number", examples: [300000] },
                },
              },
              costs: {
                type: "object",
                properties: {
                  tokenCost: { type: "number", examples: [1.5] },
                  computeCost: { type: "number", examples: [0.3] },
                  totalCost: { type: "number", examples: [1.8] },
                },
              },
              breakdown: {
                type: "object",
                properties: {
                  byResourceType: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        resourceType: { type: "string", examples: ["tokens"] },
                        quantity: { type: "number", examples: [500000] },
                        cost: { type: "number", examples: [1.5] },
                      },
                    },
                  },
                  byModel: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        model: { type: "string", examples: ["gpt-4"] },
                        tokens: { type: "number", examples: [300000] },
                        cost: { type: "number", examples: [0.9] },
                      },
                    },
                  },
                },
              },
            },
          },
          401: error401SchemaExamples,
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { startDate, endDate } = request.query;

      let dateRange: DateRange | undefined;
      if (startDate && endDate) {
        dateRange = {
          start: startDate,
          end: endDate,
        };
      }

      const ownedExecutionIds = getOwnedResourceIds(auth.tenantDb, auth.user.id, "execution");
      const ownedExecutionSet = new Set(ownedExecutionIds);

      const usageRecords = getUsage(auth.tenant.id, dateRange);

      const userRecords = usageRecords.filter((record) => {
        const metadata: UsageMetadata = JSON.parse(record.metadata);
        return metadata.executionId && ownedExecutionSet.has(metadata.executionId);
      });

      let totalTokens = 0;
      let totalComputeTimeMs = 0;
      let tokenCost = 0;
      let computeCost = 0;
      const models = new Map<string, { tokens: number; cost: number }>();

      for (const record of userRecords) {
        if (record.resourceType === "tokens") {
          totalTokens += record.quantity;
          tokenCost += record.unitCost;

          const metadata: UsageMetadata = JSON.parse(record.metadata);
          if (metadata.model) {
            const existing = models.get(metadata.model) || { tokens: 0, cost: 0 };
            models.set(metadata.model, {
              tokens: existing.tokens + record.quantity,
              cost: existing.cost + record.unitCost,
            });
          }
        } else if (record.resourceType === "compute_time") {
          totalComputeTimeMs += record.quantity;
          computeCost += record.unitCost;
        }
      }

      if (userRecords.length === 0 && ownedExecutionIds.length > 0) {
        const clientService = getTenantClientService();
        const client = await clientService.getClient(auth.tenant.id);
        const executions = await client.executions.list();

        const userExecutions = executions.filter((exec) => ownedExecutionSet.has(exec.id));

        const filteredExecutions = dateRange
          ? userExecutions.filter((exec) => {
              if (!exec.startedAt) return false;
              const execDate = new Date(exec.startedAt).toISOString().split("T")[0] as string;
              return execDate >= dateRange.start && execDate <= dateRange.end;
            })
          : userExecutions;

        for (const exec of filteredExecutions) {
          const execTokens = (exec.totalUsage?.promptTokens ?? 0) + (exec.totalUsage?.completionTokens ?? 0);
          totalTokens += execTokens;
          totalComputeTimeMs += exec.durationMs ?? 0;
          tokenCost += Number(exec.totalCostUsd) || 0;
        }
      }

      const resourceTypeBreakdown: { resourceType: string; quantity: number; cost: number }[] = [];
      if (totalTokens > 0 || tokenCost > 0) {
        resourceTypeBreakdown.push({ resourceType: "tokens", quantity: totalTokens, cost: tokenCost });
      }
      if (totalComputeTimeMs > 0 || computeCost > 0) {
        resourceTypeBreakdown.push({ resourceType: "compute_time", quantity: totalComputeTimeMs, cost: computeCost });
      }

      const modelBreakdown = Array.from(models.entries()).map(([model, data]) => ({
        model,
        tokens: data.tokens,
        cost: data.cost,
      }));

      const totalCost = tokenCost + computeCost;

      return {
        userId: auth.user.id,
        tenantId: auth.tenant.id,
        period: {
          startDate: dateRange?.start ?? null,
          endDate: dateRange?.end ?? null,
        },
        usage: {
          totalTokens,
          computeTimeMs: totalComputeTimeMs,
        },
        costs: {
          tokenCost,
          computeCost,
          totalCost,
        },
        breakdown: {
          byResourceType: resourceTypeBreakdown,
          byModel: modelBreakdown,
        },
      };
    }
  );
};

export default costsRoutes;
