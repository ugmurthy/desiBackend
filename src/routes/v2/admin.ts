import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { authenticateAdmin, type AdminAuthContext } from "../../middleware/authenticate";
import {
  createTenant,
  getTenant,
  updateTenant,
  listTenants,
  deleteTenant,
  suspendTenant,
  activateTenant,
  type CreateTenantInput,
  type UpdateTenantInput,
  type ListTenantsFilter,
} from "../../services/admin";
import type { TenantQuotas } from "../../db/admin-schema";

interface CreateTenantBody {
  name: string;
  slug: string;
  plan?: "free" | "pro" | "enterprise";
}

interface UpdateTenantBody {
  name?: string;
  status?: "active" | "suspended" | "pending";
  plan?: "free" | "pro" | "enterprise";
  quotas?: TenantQuotas;
}

interface TenantParams {
  id: string;
}

interface ListTenantsQuery {
  status?: "active" | "suspended" | "pending";
  plan?: "free" | "pro" | "enterprise";
  limit?: string;
  offset?: string;
}

async function ensureAdminScope(request: FastifyRequest, reply: FastifyReply) {
  const adminAuth = (request as FastifyRequest & { adminAuth: AdminAuthContext }).adminAuth;

  if (!adminAuth) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Admin authentication required",
    });
  }

  const scopes = adminAuth.apiKey.scopes;
  if (!scopes.includes("admin")) {
    return reply.status(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "This action requires admin scope",
    });
  }

  return;
}

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ListTenantsQuery }>(
    "/admin/tenants",
    {
      preHandler: [authenticateAdmin, ensureAdminScope],
      schema: {
        tags: ["Admin"],
        summary: "List all tenants",
        description: "Retrieves a paginated list of all tenants with optional filtering by status and plan. Requires admin scope.",
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["active", "suspended", "pending"], example: "active" },
            plan: { type: "string", enum: ["free", "pro", "enterprise"], example: "pro" },
            limit: { type: "string", example: "20" },
            offset: { type: "string", example: "0" },
          },
        },
        response: {
          200: {
            description: "List of tenants retrieved successfully",
            type: "object",
            properties: {
              tenants: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "tnt_abc123" },
                    name: { type: "string", example: "Acme Corporation" },
                    slug: { type: "string", example: "acme-corp" },
                    status: { type: "string", enum: ["active", "suspended", "pending"], example: "active" },
                    plan: { type: "string", enum: ["free", "pro", "enterprise"], example: "pro" },
                    quotas: {
                      type: "object",
                      properties: {
                        maxUsers: { type: "number", example: 50 },
                        maxAgents: { type: "number", example: 10 },
                        maxExecutionsPerMonth: { type: "number", example: 10000 },
                        maxTokensPerMonth: { type: "number", example: 1000000 },
                      },
                    },
                    createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
                    updatedAt: { type: "string", example: "2024-01-20T14:45:00.000Z" },
                  },
                },
              },
              total: { type: "number", example: 42 },
              limit: { type: "number", example: 20 },
              offset: { type: "number", example: 0 },
            },
          },
          401: {
            description: "Admin authentication required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Admin authentication required" },
            },
          },
          403: {
            description: "Admin scope required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 403 },
              error: { type: "string", example: "Forbidden" },
              message: { type: "string", example: "This action requires admin scope" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { status, plan, limit, offset } = request.query;

      const filters: ListTenantsFilter = {
        status,
        plan,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      };

      const result = listTenants(filters);

      return reply.status(200).send({
        tenants: result.tenants.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          plan: t.plan,
          quotas: JSON.parse(t.quotas),
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
        total: result.total,
        limit: filters.limit || 20,
        offset: filters.offset || 0,
      });
    }
  );

  fastify.post<{ Body: CreateTenantBody }>(
    "/admin/tenants",
    {
      preHandler: [authenticateAdmin, ensureAdminScope],
      schema: {
        tags: ["Admin"],
        summary: "Create new tenant",
        description: "Creates a new tenant with the specified name, slug, and optional plan. Requires admin scope.",
        body: {
          type: "object",
          required: ["name", "slug"],
          properties: {
            name: { type: "string", minLength: 1, example: "Acme Corporation" },
            slug: { type: "string", minLength: 1, pattern: "^[a-z0-9-]+$", example: "acme-corp" },
            plan: { type: "string", enum: ["free", "pro", "enterprise"], example: "pro" },
          },
        },
        response: {
          201: {
            description: "Tenant created successfully",
            type: "object",
            properties: {
              id: { type: "string", example: "tnt_abc123" },
              name: { type: "string", example: "Acme Corporation" },
              slug: { type: "string", example: "acme-corp" },
              status: { type: "string", enum: ["active", "suspended", "pending"], example: "pending" },
              plan: { type: "string", enum: ["free", "pro", "enterprise"], example: "pro" },
              quotas: {
                type: "object",
                properties: {
                  maxUsers: { type: "number", example: 50 },
                  maxAgents: { type: "number", example: 10 },
                  maxExecutionsPerMonth: { type: "number", example: 10000 },
                  maxTokensPerMonth: { type: "number", example: 1000000 },
                },
              },
              createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
              updatedAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
            },
          },
          400: {
            description: "Invalid request body",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 400 },
              error: { type: "string", example: "Bad Request" },
              message: { type: "string", example: "body must have required property 'name'" },
            },
          },
          401: {
            description: "Admin authentication required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Admin authentication required" },
            },
          },
          403: {
            description: "Admin scope required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 403 },
              error: { type: "string", example: "Forbidden" },
              message: { type: "string", example: "This action requires admin scope" },
            },
          },
          409: {
            description: "Tenant with slug already exists",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 409 },
              error: { type: "string", example: "Conflict" },
              message: { type: "string", example: "A tenant with this slug already exists" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, slug, plan } = request.body;

      const input: CreateTenantInput = {
        name,
        slug,
        plan,
      };

      try {
        const tenant = await createTenant(input);
        return reply.status(201).send({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          plan: tenant.plan,
          quotas: JSON.parse(tenant.quotas),
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed")
        ) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "A tenant with this slug already exists",
          });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Params: TenantParams }>(
    "/admin/tenants/:id",
    {
      preHandler: [authenticateAdmin, ensureAdminScope],
      schema: {
        tags: ["Admin"],
        summary: "Get tenant by ID",
        description: "Retrieves a single tenant by its unique identifier. Requires admin scope.",
        params: {
          type: "object",
          properties: {
            id: { type: "string", example: "tnt_abc123" },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Tenant retrieved successfully",
            type: "object",
            properties: {
              id: { type: "string", example: "tnt_abc123" },
              name: { type: "string", example: "Acme Corporation" },
              slug: { type: "string", example: "acme-corp" },
              status: { type: "string", enum: ["active", "suspended", "pending"], example: "active" },
              plan: { type: "string", enum: ["free", "pro", "enterprise"], example: "pro" },
              quotas: {
                type: "object",
                properties: {
                  maxUsers: { type: "number", example: 50 },
                  maxAgents: { type: "number", example: 10 },
                  maxExecutionsPerMonth: { type: "number", example: 10000 },
                  maxTokensPerMonth: { type: "number", example: 1000000 },
                },
              },
              createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
              updatedAt: { type: "string", example: "2024-01-20T14:45:00.000Z" },
            },
          },
          401: {
            description: "Admin authentication required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Admin authentication required" },
            },
          },
          403: {
            description: "Admin scope required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 403 },
              error: { type: "string", example: "Forbidden" },
              message: { type: "string", example: "This action requires admin scope" },
            },
          },
          404: {
            description: "Tenant not found",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Tenant not found" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const tenant = getTenant(id);

      if (!tenant) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      return reply.status(200).send({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        quotas: JSON.parse(tenant.quotas),
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      });
    }
  );

  fastify.patch<{ Params: TenantParams; Body: UpdateTenantBody }>(
    "/admin/tenants/:id",
    {
      preHandler: [authenticateAdmin, ensureAdminScope],
      schema: {
        tags: ["Admin"],
        summary: "Update tenant",
        description: "Updates an existing tenant's properties such as name, status, plan, or quotas. Requires admin scope.",
        params: {
          type: "object",
          properties: {
            id: { type: "string", example: "tnt_abc123" },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, example: "Acme Corporation Updated" },
            status: { type: "string", enum: ["active", "suspended", "pending"], example: "active" },
            plan: { type: "string", enum: ["free", "pro", "enterprise"], example: "enterprise" },
            quotas: {
              type: "object",
              properties: {
                maxUsers: { type: "number", example: 100 },
                maxAgents: { type: "number", example: 25 },
                maxExecutionsPerMonth: { type: "number", example: 50000 },
                maxTokensPerMonth: { type: "number", example: 5000000 },
              },
            },
          },
        },
        response: {
          200: {
            description: "Tenant updated successfully",
            type: "object",
            properties: {
              id: { type: "string", example: "tnt_abc123" },
              name: { type: "string", example: "Acme Corporation Updated" },
              slug: { type: "string", example: "acme-corp" },
              status: { type: "string", enum: ["active", "suspended", "pending"], example: "active" },
              plan: { type: "string", enum: ["free", "pro", "enterprise"], example: "enterprise" },
              quotas: {
                type: "object",
                properties: {
                  maxUsers: { type: "number", example: 100 },
                  maxAgents: { type: "number", example: 25 },
                  maxExecutionsPerMonth: { type: "number", example: 50000 },
                  maxTokensPerMonth: { type: "number", example: 5000000 },
                },
              },
              createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
              updatedAt: { type: "string", example: "2024-01-25T09:15:00.000Z" },
            },
          },
          400: {
            description: "Invalid request body",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 400 },
              error: { type: "string", example: "Bad Request" },
              message: { type: "string", example: "body/status must be equal to one of the allowed values" },
            },
          },
          401: {
            description: "Admin authentication required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Admin authentication required" },
            },
          },
          403: {
            description: "Admin scope required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 403 },
              error: { type: "string", example: "Forbidden" },
              message: { type: "string", example: "This action requires admin scope" },
            },
          },
          404: {
            description: "Tenant not found",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Tenant not found" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const updates: UpdateTenantInput = request.body;

      const tenant = updateTenant(id, updates);

      if (!tenant) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      return reply.status(200).send({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        quotas: JSON.parse(tenant.quotas),
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      });
    }
  );

  fastify.delete<{ Params: TenantParams; Querystring: { action?: string } }>(
    "/admin/tenants/:id",
    {
      preHandler: [authenticateAdmin, ensureAdminScope],
      schema: {
        tags: ["Admin"],
        summary: "Delete or suspend tenant",
        description: "Deletes or suspends a tenant. Use action=delete for permanent deletion or action=suspend (or omit) to suspend. Requires admin scope.",
        consumes: ["application/json"],
        params: {
          type: "object",
          properties: {
            id: { type: "string", example: "tnt_abc123" },
          },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["suspend", "delete"], example: "suspend" },
          },
        },
        response: {
          200: {
            description: "Tenant suspended successfully",
            type: "object",
            properties: {
              id: { type: "string", example: "tnt_abc123" },
              name: { type: "string", example: "Acme Corporation" },
              slug: { type: "string", example: "acme-corp" },
              status: { type: "string", enum: ["active", "suspended", "pending"], example: "suspended" },
              plan: { type: "string", enum: ["free", "pro", "enterprise"], example: "pro" },
              quotas: {
                type: "object",
                properties: {
                  maxUsers: { type: "number", example: 50 },
                  maxAgents: { type: "number", example: 10 },
                  maxExecutionsPerMonth: { type: "number", example: 10000 },
                  maxTokensPerMonth: { type: "number", example: 1000000 },
                },
              },
              createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
              updatedAt: { type: "string", example: "2024-01-25T09:15:00.000Z" },
            },
          },
          204: {
            description: "Tenant deleted successfully",
            type: "null",
          },
          401: {
            description: "Admin authentication required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Admin authentication required" },
            },
          },
          403: {
            description: "Admin scope required",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 403 },
              error: { type: "string", example: "Forbidden" },
              message: { type: "string", example: "This action requires admin scope" },
            },
          },
          404: {
            description: "Tenant not found",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Tenant not found" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { action } = request.query;

      const existing = getTenant(id);
      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      if (action === "delete") {
        const deleted = deleteTenant(id);
        if (deleted) {
          return reply.status(204).send();
        }
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      const suspended = suspendTenant(id);
      if (!suspended) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      return reply.status(200).send({
        id: suspended.id,
        name: suspended.name,
        slug: suspended.slug,
        status: suspended.status,
        plan: suspended.plan,
        quotas: JSON.parse(suspended.quotas),
        createdAt: suspended.createdAt,
        updatedAt: suspended.updatedAt,
      });
    }
  );
};

export default adminRoutes;
