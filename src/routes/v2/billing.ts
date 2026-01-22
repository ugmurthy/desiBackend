import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getUsage, getUsageSummary, type DateRange } from "../../services/billing";
import type { UsageMetadata } from "../../db/billing-schema";

interface UsageHistoryQuery {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

const billingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/billing/usage",
    {
      preHandler: [authenticate],
    },
    async (request) => {
      const auth = request.auth!;
      const tenantId = auth.tenant.id;

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const dateRange: DateRange = {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      };

      const usageSummary = getUsageSummary(tenantId, dateRange);
      const usageRecords = getUsage(tenantId, dateRange);

      const tokenSummary = usageSummary.find((s) => s.resourceType === "tokens");
      const computeSummary = usageSummary.find((s) => s.resourceType === "compute_time");

      const totalCost = usageSummary.reduce((sum, s) => sum + Number(s.totalCost), 0);

      const uniqueExecutions = new Set<string>();
      const uniqueDags = new Set<string>();

      usageRecords.forEach((record) => {
        const metadata: UsageMetadata = JSON.parse(record.metadata);
        if (metadata.executionId) {
          uniqueExecutions.add(metadata.executionId);
        }
        if (metadata.dagId) {
          uniqueDags.add(metadata.dagId);
        }
      });

      return {
        tenantId,
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
        usage: {
          totalTokens: tokenSummary?.totalQuantity ?? 0,
          computeTimeMs: computeSummary?.totalQuantity ?? 0,
          totalExecutions: uniqueExecutions.size,
          totalDags: uniqueDags.size,
        },
        costs: {
          tokenCost: Number(tokenSummary?.totalCost ?? 0),
          computeCost: Number(computeSummary?.totalCost ?? 0),
          totalCost,
        },
        quotas: auth.tenant.quotas,
      };
    }
  );

  fastify.get<{ Querystring: UsageHistoryQuery }>(
    "/billing/usage/history",
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const tenantId = auth.tenant.id;
      const { startDate, endDate, limit = 50, offset = 0 } = request.query;

      let dateRange: DateRange | undefined;
      if (startDate && endDate) {
        dateRange = {
          start: startDate,
          end: endDate,
        };
      }

      const usageRecords = getUsage(tenantId, dateRange);
      const usageSummary = getUsageSummary(tenantId, dateRange);

      const totalRecords = usageRecords.length;
      const paginatedRecords = usageRecords.slice(offset, offset + limit);

      const formattedRecords = paginatedRecords.map((record) => {
        const metadata: UsageMetadata = JSON.parse(record.metadata);
        return {
          id: record.id,
          resourceType: record.resourceType,
          quantity: record.quantity,
          unitCost: Number(record.unitCost),
          metadata: {
            executionId: metadata.executionId ?? null,
            dagId: metadata.dagId ?? null,
            model: metadata.model ?? null,
            inputTokens: metadata.inputTokens ?? null,
            outputTokens: metadata.outputTokens ?? null,
            computeTimeMs: metadata.computeTimeMs ?? null,
          },
          timestamp: record.timestamp,
        };
      });

      const totalCost = usageSummary.reduce((sum, s) => sum + Number(s.totalCost), 0);

      return {
        tenantId,
        period: {
          startDate: dateRange?.start ?? null,
          endDate: dateRange?.end ?? null,
        },
        records: formattedRecords,
        summary: {
          byResourceType: usageSummary.map((s) => ({
            resourceType: s.resourceType,
            totalQuantity: s.totalQuantity,
            totalCost: Number(s.totalCost),
          })),
          totalCost,
        },
        pagination: {
          total: totalRecords,
          limit,
          offset,
          hasMore: offset + limit < totalRecords,
        },
      };
    }
  );
};

export default billingRoutes;
