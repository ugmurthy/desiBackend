import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";
import { getUsage, getUsageSummary, type DateRange } from "../../services/billing";
import type { UsageMetadata } from "../../db/billing-schema";

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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
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
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
          },
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

      const totalCost = usageSummary.reduce((sum, s) => sum + s.totalCost, 0);

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

      const modelBreakdown = Array.from(models.entries()).map(([model, data]) => ({
        model,
        tokens: data.tokens,
        cost: data.cost,
      }));

      return {
        tenantId: auth.tenant.id,
        period: {
          startDate: dateRange?.start ?? null,
          endDate: dateRange?.end ?? null,
        },
        usage: {
          totalTokens: tokenSummary?.totalQuantity ?? 0,
          computeTimeMs: computeSummary?.totalQuantity ?? 0,
        },
        costs: {
          tokenCost: tokenSummary?.totalCost ?? 0,
          computeCost: computeSummary?.totalCost ?? 0,
          totalCost,
        },
        breakdown: {
          byResourceType: usageSummary.map((s) => ({
            resourceType: s.resourceType,
            quantity: s.totalQuantity,
            cost: s.totalCost,
          })),
          byModel: modelBreakdown,
        },
      };
    }
  );
};

export default costsRoutes;
