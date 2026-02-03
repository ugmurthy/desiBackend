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
      schema: {
        tags: ["Authentication"],
        summary: "Get current user info",
        description: "Returns the authenticated user's profile and tenant information",
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string", example: "usr_abc123" },
              email: { type: "string", format: "email", example: "john@example.com" },
              name: { type: "string", example: "John Doe" },
              role: { type: "string", example: "admin" },
              tenant: {
                type: "object",
                properties: {
                  id: { type: "string", example: "ten_xyz789" },
                  name: { type: "string", example: "Acme Corp" },
                  slug: { type: "string", example: "acme-corp" },
                  plan: { type: "string", example: "pro" },
                },
              },
            },
            example: {
              id: "usr_abc123",
              email: "john@example.com",
              name: "John Doe",
              role: "admin",
              tenant: {
                id: "ten_xyz789",
                name: "Acme Corp",
                slug: "acme-corp",
                plan: "pro",
              },
            },
          },
          401: {
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
            example: {
              statusCode: 401,
              error: "Unauthorized",
              message: "Authentication required",
            },
          },
        },
      },
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
      schema: {
        tags: ["Authentication"],
        summary: "List API keys",
        description: "Returns all API keys for the authenticated user",
        response: {
          200: {
            type: "object",
            properties: {
              apiKeys: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "key_abc123" },
                    name: { type: "string", example: "Production API Key" },
                    keyPrefix: { type: "string", example: "sk_live_abc" },
                    scopes: {
                      type: "array",
                      items: { type: "string", enum: ["read", "write", "admin"] },
                      example: ["read", "write"],
                    },
                    expiresAt: { type: "string", format: "date-time", nullable: true, example: "2025-12-31T23:59:59Z" },
                    createdAt: { type: "string", format: "date-time", example: "2024-01-15T10:30:00Z" },
                  },
                },
              },
            },
            example: {
              apiKeys: [
                {
                  id: "key_abc123",
                  name: "Production API Key",
                  keyPrefix: "sk_live_abc",
                  scopes: ["read", "write"],
                  expiresAt: "2025-12-31T23:59:59Z",
                  createdAt: "2024-01-15T10:30:00Z",
                },
              ],
            },
          },
          401: {
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
            example: {
              statusCode: 401,
              error: "Unauthorized",
              message: "Authentication required",
            },
          },
        },
      },
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
        tags: ["Authentication"],
        summary: "Create API key",
        description: "Creates a new API key for the authenticated user",
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100, example: "Production API Key" },
            scopes: {
              type: "array",
              items: { type: "string", enum: ["read", "write", "admin"] },
              example: ["read", "write"],
            },
            expiresAt: { type: "string", format: "date-time", example: "2025-12-31T23:59:59Z" },
          },
          example: {
            name: "Production API Key",
            scopes: ["read", "write"],
            expiresAt: "2025-12-31T23:59:59Z",
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string", example: "key_abc123" },
              name: { type: "string", example: "Production API Key" },
              keyPrefix: { type: "string", example: "sk_live_abc" },
              key: { type: "string", example: "sk_live_abc123def456ghi789" },
              scopes: {
                type: "array",
                items: { type: "string", enum: ["read", "write", "admin"] },
                example: ["read", "write"],
              },
              expiresAt: { type: "string", format: "date-time", nullable: true, example: "2025-12-31T23:59:59Z" },
              createdAt: { type: "string", format: "date-time", example: "2024-01-15T10:30:00Z" },
            },
            example: {
              id: "key_abc123",
              name: "Production API Key",
              keyPrefix: "sk_live_abc",
              key: "sk_live_abc123def456ghi789",
              scopes: ["read", "write"],
              expiresAt: "2025-12-31T23:59:59Z",
              createdAt: "2024-01-15T10:30:00Z",
            },
          },
          400: {
            type: "object",
            properties: {
              statusCode: { type: "number", example: 400 },
              error: { type: "string", example: "Bad Request" },
              message: { type: "string", example: "body/name must NOT have fewer than 1 characters" },
            },
            example: {
              statusCode: 400,
              error: "Bad Request",
              message: "body/name must NOT have fewer than 1 characters",
            },
          },
          401: {
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
            example: {
              statusCode: 401,
              error: "Unauthorized",
              message: "Authentication required",
            },
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
        tags: ["Authentication"],
        summary: "Revoke API key",
        description: "Revokes an existing API key by ID",
        consumes: ["application/json"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", example: "key_abc123" },
          },
        },
        response: {
          204: {
            type: "null",
            description: "API key successfully revoked",
          },
          401: {
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
            example: {
              statusCode: 401,
              error: "Unauthorized",
              message: "Authentication required",
            },
          },
          404: {
            type: "object",
            properties: {
              statusCode: { type: "number", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "API key not found" },
            },
            example: {
              statusCode: 404,
              error: "Not Found",
              message: "API key not found",
            },
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
