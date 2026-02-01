import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";

interface AgentIdParams {
  id: string;
}

interface AgentNameParams {
  name: string;
}

interface CreateAgentBody {
  name: string;
  version: string;
  systemPrompt: string;
  params?: {
    provider?: "openai" | "openrouter" | "ollama";
    model?: string;
    metadata?: Record<string, unknown>;
  };
}

interface UpdateAgentBody {
  name?: string;
  version?: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
}

interface ListAgentsQuery {
  status?: "active" | "inactive";
  name?: string;
  limit?: number;
  offset?: number;
}

const agentResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
    name: { type: "string", example: "translator" },
    version: { type: "string", example: "1.0" },
    description: { type: "string", nullable: true, example: "Translates text between languages" },
    systemPrompt: { type: "string", example: "You are a translator..." },
    provider: { type: "string", example: "openai" },
    model: { type: "string", example: "gpt-4" },
    isActive: { type: "boolean", example: true },
    metadata: { type: "object", additionalProperties: true, example: {} },
    createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
    updatedAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
  },
};

const errorResponseSchema = {
  type: "object",
  properties: {
    statusCode: { type: "integer" },
    error: { type: "string" },
    message: { type: "string" },
  },
};

const agentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateAgentBody }>(
    "/agents",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Agents"],
        summary: "Create a new agent",
        description: "Creates a new agent with the specified configuration. The agent name must be unique within the tenant.",
        body: {
          type: "object",
          required: ["name", "version", "systemPrompt"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100, example: "translator" },
            version: { type: "string", minLength: 1, maxLength: 50, example: "1.0" },
            systemPrompt: { type: "string", minLength: 1, example: "You are a translator..." },
            params: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["openai", "openrouter", "ollama"], example: "openai" },
                model: { type: "string", example: "gpt-4" },
                metadata: { type: "object", additionalProperties: true, example: {} },
              },
            },
          },
        },
        response: {
          201: agentResponseSchema,
          400: { ...errorResponseSchema, example: { statusCode: 400, error: "Bad Request", message: "Validation failed" } },
          401: { ...errorResponseSchema, example: { statusCode: 401, error: "Unauthorized", message: "Invalid or missing authentication" } },
          409: { ...errorResponseSchema, example: { statusCode: 409, error: "Conflict", message: "Agent with name 'translator' already exists" } },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { name, version, systemPrompt, params } = request.body;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const agent = await client.agents.create(name, version, systemPrompt, params);

        return reply.status(201).send({
          id: agent.id,
          name: agent.name,
          version: agent.version,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          provider: agent.provider,
          model: agent.model,
          isActive: agent.isActive,
          metadata: agent.metadata,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("already exists")) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Querystring: ListAgentsQuery }>(
    "/agents",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Agents"],
        summary: "List agents",
        description: "Retrieves a paginated list of agents with optional filtering by status and name.",
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["active", "inactive"], example: "active" },
            name: { type: "string", example: "translator" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20, example: 20 },
            offset: { type: "integer", minimum: 0, default: 0, example: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              agents: { type: "array", items: agentResponseSchema },
              pagination: {
                type: "object",
                properties: {
                  total: { type: "integer", example: 50 },
                  limit: { type: "integer", example: 20 },
                  offset: { type: "integer", example: 0 },
                  hasMore: { type: "boolean", example: true },
                },
              },
            },
          },
          401: { ...errorResponseSchema, example: { statusCode: 401, error: "Unauthorized", message: "Invalid or missing authentication" } },
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { status, name, limit = 20, offset = 0 } = request.query;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      const filter: Record<string, unknown> = {};
      if (name) {
        filter.name = name;
      }
      if (status === "active") {
        filter.active = true;
      } else if (status === "inactive") {
        filter.active = false;
      }

      const agents = await client.agents.list(filter);

      const paginatedAgents = agents.slice(offset, offset + limit);

      return {
        agents: paginatedAgents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          version: agent.version,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          provider: agent.provider,
          model: agent.model,
          isActive: agent.isActive,
          metadata: agent.metadata,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        })),
        pagination: {
          total: agents.length,
          limit,
          offset,
          hasMore: offset + limit < agents.length,
        },
      };
    }
  );

  fastify.get<{ Params: AgentIdParams }>(
    "/agents/:id",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Agents"],
        summary: "Get agent by ID",
        description: "Retrieves a specific agent by its unique identifier.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          200: agentResponseSchema,
          401: { ...errorResponseSchema, example: { statusCode: 401, error: "Unauthorized", message: "Invalid or missing authentication" } },
          404: { ...errorResponseSchema, example: { statusCode: 404, error: "Not Found", message: "Agent not found" } },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const agent = await client.agents.get(id);

        return {
          id: agent.id,
          name: agent.name,
          version: agent.version,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          provider: agent.provider,
          model: agent.model,
          isActive: agent.isActive,
          metadata: agent.metadata,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Agent not found",
          });
        }
        throw error;
      }
    }
  );

  fastify.patch<{ Params: AgentIdParams; Body: UpdateAgentBody }>(
    "/agents/:id",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Agents"],
        summary: "Update agent",
        description: "Updates an existing agent with the provided fields. Only specified fields will be updated.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100, example: "translator-v2" },
            version: { type: "string", minLength: 1, maxLength: 50, example: "2.0" },
            systemPrompt: { type: "string", minLength: 1, example: "You are an improved translator..." },
            metadata: { type: "object", additionalProperties: true, example: { language: "en" } },
          },
        },
        response: {
          200: agentResponseSchema,
          400: { ...errorResponseSchema, example: { statusCode: 400, error: "Bad Request", message: "Validation failed" } },
          401: { ...errorResponseSchema, example: { statusCode: 401, error: "Unauthorized", message: "Invalid or missing authentication" } },
          404: { ...errorResponseSchema, example: { statusCode: 404, error: "Not Found", message: "Agent not found" } },
          409: { ...errorResponseSchema, example: { statusCode: 409, error: "Conflict", message: "Agent with name 'translator-v2' already exists" } },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;
      const updates = request.body;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const agent = await client.agents.update(id, updates);

        return {
          id: agent.id,
          name: agent.name,
          version: agent.version,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          provider: agent.provider,
          model: agent.model,
          isActive: agent.isActive,
          metadata: agent.metadata,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Agent not found",
          });
        }
        if (error instanceof Error && error.message.includes("already exists")) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  fastify.delete<{ Params: AgentIdParams }>(
    "/agents/:id",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Agents"],
        summary: "Delete agent",
        description: "Deletes an agent by its ID. Active agents cannot be deleted.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          204: { type: "null", description: "Agent successfully deleted" },
          400: { ...errorResponseSchema, example: { statusCode: 400, error: "Bad Request", message: "Cannot delete active agent" } },
          401: { ...errorResponseSchema, example: { statusCode: 401, error: "Unauthorized", message: "Invalid or missing authentication" } },
          404: { ...errorResponseSchema, example: { statusCode: 404, error: "Not Found", message: "Agent not found" } },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        await client.agents.delete(id);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Agent not found",
          });
        }
        if (error instanceof Error && error.message.includes("Cannot delete active agent")) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  fastify.post<{ Params: AgentIdParams }>(
    "/agents/:id/activate",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Agents"],
        summary: "Activate agent",
        description: "Activates an agent, making it the active version for its name. This will deactivate any previously active agent with the same name.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          200: agentResponseSchema,
          401: { ...errorResponseSchema, example: { statusCode: 401, error: "Unauthorized", message: "Invalid or missing authentication" } },
          404: { ...errorResponseSchema, example: { statusCode: 404, error: "Not Found", message: "Agent not found" } },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const agent = await client.agents.activate(id);

        return {
          id: agent.id,
          name: agent.name,
          version: agent.version,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          provider: agent.provider,
          model: agent.model,
          isActive: agent.isActive,
          metadata: agent.metadata,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Agent not found",
          });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Params: AgentNameParams }>(
    "/agents/resolve/:name",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Agents"],
        summary: "Resolve agent by name",
        description: "Finds the currently active agent with the specified name.",
        params: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "translator" },
          },
        },
        response: {
          200: agentResponseSchema,
          401: { ...errorResponseSchema, example: { statusCode: 401, error: "Unauthorized", message: "Invalid or missing authentication" } },
          404: { ...errorResponseSchema, example: { statusCode: 404, error: "Not Found", message: "No active agent found with name 'translator'" } },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { name } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      const agent = await client.agents.resolve(name);

      if (!agent) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `No active agent found with name '${name}'`,
        });
      }

      return {
        id: agent.id,
        name: agent.name,
        version: agent.version,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        provider: agent.provider,
        model: agent.model,
        isActive: agent.isActive,
        metadata: agent.metadata,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      };
    }
  );
};

export default agentsRoutes;
