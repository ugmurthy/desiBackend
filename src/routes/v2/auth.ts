import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { createApiKey, listApiKeys, revokeApiKey } from "../../services/api-key";

interface CreateApiKeyBody {
  name: string;
  scopes?: ("read" | "write" | "admin")[];
  expiresAt?: string;
}

interface ApiKeyIdParams {
  id: string;
}

const AUTH_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
    },
  },
};

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/auth/me",
    {
      ...AUTH_RATE_LIMIT,
      preHandler: [authenticate],
    },
    async (request) => {
      const auth = request.auth!;

      return {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        role: auth.user.role,
        tenant: {
          id: auth.tenant.id,
          name: auth.tenant.name,
          slug: auth.tenant.slug,
          plan: auth.tenant.plan,
        },
      };
    }
  );

  fastify.get(
    "/auth/api-keys",
    {
      ...AUTH_RATE_LIMIT,
      preHandler: [authenticate],
    },
    async (request) => {
      const auth = request.auth!;
      const keys = listApiKeys(auth.tenantDb, auth.user.id);

      return {
        apiKeys: keys.map((key) => ({
          id: key.id,
          name: key.name,
          keyPrefix: key.keyPrefix,
          scopes: key.scopes,
          expiresAt: key.expiresAt,
          createdAt: key.createdAt,
        })),
      };
    }
  );

  fastify.post<{ Body: CreateApiKeyBody }>(
    "/auth/api-keys",
    {
      ...AUTH_RATE_LIMIT,
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            scopes: {
              type: "array",
              items: { type: "string", enum: ["read", "write", "admin"] },
            },
            expiresAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { name, scopes, expiresAt } = request.body;

      const result = await createApiKey(auth.tenantDb, auth.tenant.id, {
        userId: auth.user.id,
        name,
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      return reply.status(201).send({
        id: result.id,
        name: result.name,
        keyPrefix: result.keyPrefix,
        key: result.fullKey,
        scopes: result.scopes,
        expiresAt: result.expiresAt,
        createdAt: result.createdAt,
      });
    }
  );

  fastify.delete<{ Params: ApiKeyIdParams }>(
    "/auth/api-keys/:id",
    {
      ...AUTH_RATE_LIMIT,
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

      const deleted = revokeApiKey(auth.tenantDb, id, auth.user.id);

      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "API key not found",
        });
      }

      return reply.status(204).send();
    }
  );
};

export default authRoutes;
