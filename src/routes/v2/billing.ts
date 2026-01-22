import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getUsage, getUsageSummary, type DateRange } from "../../services/billing";
import type { UsageMetadata, LineItem } from "../../db/billing-schema";
import { getAdminDatabase, initializeAdminDatabase } from "../../db/admin-schema";
import { initializeBillingSchema, type Invoice } from "../../db/billing-schema";

interface UsageHistoryQuery {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface InvoiceListQuery {
  status?: "draft" | "pending" | "paid" | "cancelled";
  limit?: number;
  offset?: number;
}

interface InvoiceParams {
  id: string;
}

function getInvoices(tenantId: string, status?: string): Invoice[] {
  initializeAdminDatabase();
  const db = initializeBillingSchema();

  let query = "SELECT * FROM invoices WHERE tenantId = ?";
  const params: (string | number)[] = [tenantId];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }

  query += " ORDER BY createdAt DESC";

  return db.query(query).all(...params) as Invoice[];
}

function getInvoiceById(tenantId: string, invoiceId: string): Invoice | null {
  initializeAdminDatabase();
  const db = initializeBillingSchema();

  const result = db
    .query("SELECT * FROM invoices WHERE id = ? AND tenantId = ?")
    .get(invoiceId, tenantId) as Invoice | null;

  return result;
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

  fastify.get<{ Querystring: InvoiceListQuery }>(
    "/billing/invoices",
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["draft", "pending", "paid", "cancelled"],
            },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const tenantId = auth.tenant.id;
      const { status, limit = 50, offset = 0 } = request.query;

      const invoices = getInvoices(tenantId, status);
      const totalRecords = invoices.length;
      const paginatedInvoices = invoices.slice(offset, offset + limit);

      const formattedInvoices = paginatedInvoices.map((invoice) => ({
        id: invoice.id,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        subtotal: Number(invoice.subtotal),
        total: Number(invoice.total),
        status: invoice.status,
        createdAt: invoice.createdAt,
      }));

      return {
        tenantId,
        invoices: formattedInvoices,
        pagination: {
          total: totalRecords,
          limit,
          offset,
          hasMore: offset + limit < totalRecords,
        },
      };
    }
  );

  fastify.get<{ Params: InvoiceParams }>(
    "/billing/invoices/:id",
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
      const tenantId = auth.tenant.id;
      const { id } = request.params;

      const invoice = getInvoiceById(tenantId, id);

      if (!invoice) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `Invoice with id '${id}' not found`,
        });
      }

      const lineItems: LineItem[] = JSON.parse(invoice.lineItems);

      return {
        id: invoice.id,
        tenantId: invoice.tenantId,
        period: {
          start: invoice.periodStart,
          end: invoice.periodEnd,
        },
        lineItems: lineItems.map((item) => ({
          resourceType: item.resourceType,
          description: item.description,
          quantity: item.quantity,
          unitCost: Number(item.unitCost),
          total: Number(item.total),
        })),
        subtotal: Number(invoice.subtotal),
        total: Number(invoice.total),
        status: invoice.status,
        createdAt: invoice.createdAt,
      };
    }
  );
};

export default billingRoutes;
