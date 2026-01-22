import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { authenticate, type AuthContext } from "../../middleware/authenticate";
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

function ensureSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  const auth = (request as FastifyRequest & { auth: AuthContext }).auth;

  if (!auth) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  const scopes = auth.apiKey.scopes;
  if (!scopes.includes("super_admin")) {
    return reply.status(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "This action requires super_admin scope",
    });
  }
}

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ListTenantsQuery }>(
    "/admin/tenants",
    {
      preHandler: [authenticate, ensureSuperAdmin],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["active", "suspended", "pending"] },
            plan: { type: "string", enum: ["free", "pro", "enterprise"] },
            limit: { type: "string" },
            offset: { type: "string" },
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
      preHandler: [authenticate, ensureSuperAdmin],
      schema: {
        body: {
          type: "object",
          required: ["name", "slug"],
          properties: {
            name: { type: "string", minLength: 1 },
            slug: { type: "string", minLength: 1, pattern: "^[a-z0-9-]+$" },
            plan: { type: "string", enum: ["free", "pro", "enterprise"] },
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
        const tenant = createTenant(input);
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
      preHandler: [authenticate, ensureSuperAdmin],
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
      preHandler: [authenticate, ensureSuperAdmin],
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["active", "suspended", "pending"] },
            plan: { type: "string", enum: ["free", "pro", "enterprise"] },
            quotas: {
              type: "object",
              properties: {
                maxUsers: { type: "number" },
                maxAgents: { type: "number" },
                maxExecutionsPerMonth: { type: "number" },
                maxTokensPerMonth: { type: "number" },
              },
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
      preHandler: [authenticate, ensureSuperAdmin],
      schema: {
        querystring: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["suspend", "delete"] },
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
