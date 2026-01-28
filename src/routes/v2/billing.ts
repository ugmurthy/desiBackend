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
      schema: {
        tags: ["Billing"],
        summary: "Get current billing period usage",
        description: "Retrieves usage statistics and costs for the current billing period including tokens, compute time, executions, and DAGs.",
        response: {
          200: {
            type: "object",
            description: "Current billing period usage data",
            properties: {
              tenantId: { type: "string", example: "tenant_abc123" },
              period: {
                type: "object",
                properties: {
                  start: { type: "string", format: "date-time", example: "2024-01-01T00:00:00.000Z" },
                  end: { type: "string", format: "date-time", example: "2024-01-31T23:59:59.999Z" },
                },
              },
              usage: {
                type: "object",
                properties: {
                  totalTokens: { type: "integer", example: 150000 },
                  computeTimeMs: { type: "integer", example: 3600000 },
                  totalExecutions: { type: "integer", example: 42 },
                  totalDags: { type: "integer", example: 5 },
                },
              },
              costs: {
                type: "object",
                properties: {
                  tokenCost: { type: "number", example: 15.0 },
                  computeCost: { type: "number", example: 7.5 },
                  totalCost: { type: "number", example: 22.5 },
                },
              },
              quotas: {
                type: "object",
                example: { maxTokens: 1000000, maxComputeTimeMs: 36000000 },
              },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized - Invalid or missing authentication",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
          },
        },
      },
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
        tags: ["Billing"],
        summary: "Get usage history with pagination",
        description: "Retrieves historical usage records with optional date filtering and pagination support.",
        querystring: {
          type: "object",
          properties: {
            startDate: { type: "string", format: "date", example: "2024-01-01" },
            endDate: { type: "string", format: "date", example: "2024-01-31" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50, example: 50 },
            offset: { type: "integer", minimum: 0, default: 0, example: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            description: "Usage history with pagination",
            properties: {
              tenantId: { type: "string", example: "tenant_abc123" },
              period: {
                type: "object",
                properties: {
                  startDate: { type: "string", nullable: true, example: "2024-01-01" },
                  endDate: { type: "string", nullable: true, example: "2024-01-31" },
                },
              },
              records: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "usage_xyz789" },
                    resourceType: { type: "string", example: "tokens" },
                    quantity: { type: "integer", example: 5000 },
                    unitCost: { type: "number", example: 0.0001 },
                    metadata: {
                      type: "object",
                      properties: {
                        executionId: { type: "string", nullable: true, example: "exec_123" },
                        dagId: { type: "string", nullable: true, example: "dag_456" },
                        model: { type: "string", nullable: true, example: "gpt-4" },
                        inputTokens: { type: "integer", nullable: true, example: 3000 },
                        outputTokens: { type: "integer", nullable: true, example: 2000 },
                        computeTimeMs: { type: "integer", nullable: true, example: 1500 },
                      },
                    },
                    timestamp: { type: "string", format: "date-time", example: "2024-01-15T10:30:00.000Z" },
                  },
                },
              },
              summary: {
                type: "object",
                properties: {
                  byResourceType: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        resourceType: { type: "string", example: "tokens" },
                        totalQuantity: { type: "integer", example: 150000 },
                        totalCost: { type: "number", example: 15.0 },
                      },
                    },
                  },
                  totalCost: { type: "number", example: 22.5 },
                },
              },
              pagination: {
                type: "object",
                properties: {
                  total: { type: "integer", example: 100 },
                  limit: { type: "integer", example: 50 },
                  offset: { type: "integer", example: 0 },
                  hasMore: { type: "boolean", example: true },
                },
              },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized - Invalid or missing authentication",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
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
        tags: ["Billing"],
        summary: "List invoices",
        description: "Retrieves a paginated list of invoices for the authenticated tenant with optional status filtering.",
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["draft", "pending", "paid", "cancelled"],
              example: "paid",
            },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50, example: 50 },
            offset: { type: "integer", minimum: 0, default: 0, example: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            description: "List of invoices with pagination",
            properties: {
              tenantId: { type: "string", example: "tenant_abc123" },
              invoices: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "inv_abc123" },
                    periodStart: { type: "string", format: "date-time", example: "2024-01-01T00:00:00.000Z" },
                    periodEnd: { type: "string", format: "date-time", example: "2024-01-31T23:59:59.999Z" },
                    subtotal: { type: "number", example: 22.5 },
                    total: { type: "number", example: 22.5 },
                    status: { type: "string", enum: ["draft", "pending", "paid", "cancelled"], example: "paid" },
                    createdAt: { type: "string", format: "date-time", example: "2024-02-01T00:00:00.000Z" },
                  },
                },
              },
              pagination: {
                type: "object",
                properties: {
                  total: { type: "integer", example: 12 },
                  limit: { type: "integer", example: 50 },
                  offset: { type: "integer", example: 0 },
                  hasMore: { type: "boolean", example: false },
                },
              },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized - Invalid or missing authentication",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
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
        tags: ["Billing"],
        summary: "Get invoice details",
        description: "Retrieves detailed information for a specific invoice including line items and totals.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", example: "inv_abc123" },
          },
        },
        response: {
          200: {
            type: "object",
            description: "Invoice details with line items",
            properties: {
              id: { type: "string", example: "inv_abc123" },
              tenantId: { type: "string", example: "tenant_abc123" },
              period: {
                type: "object",
                properties: {
                  start: { type: "string", format: "date-time", example: "2024-01-01T00:00:00.000Z" },
                  end: { type: "string", format: "date-time", example: "2024-01-31T23:59:59.999Z" },
                },
              },
              lineItems: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    resourceType: { type: "string", example: "tokens" },
                    description: { type: "string", example: "Token usage for January 2024" },
                    quantity: { type: "integer", example: 150000 },
                    unitCost: { type: "number", example: 0.0001 },
                    total: { type: "number", example: 15.0 },
                  },
                },
              },
              subtotal: { type: "number", example: 22.5 },
              total: { type: "number", example: 22.5 },
              status: { type: "string", enum: ["draft", "pending", "paid", "cancelled"], example: "paid" },
              createdAt: { type: "string", format: "date-time", example: "2024-02-01T00:00:00.000Z" },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized - Invalid or missing authentication",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
          },
          404: {
            type: "object",
            description: "Invoice not found",
            properties: {
              statusCode: { type: "integer", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Invoice with id 'inv_xyz' not found" },
            },
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
