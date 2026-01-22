import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";

interface AgentIdParams {
  id: string;
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

const agentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateAgentBody }>(
    "/agents",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["name", "version", "systemPrompt"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            version: { type: "string", minLength: 1, maxLength: 50 },
            systemPrompt: { type: "string", minLength: 1 },
            params: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["openai", "openrouter", "ollama"] },
                model: { type: "string" },
                metadata: { type: "object" },
              },
            },
          },
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
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["active", "inactive"] },
            name: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            version: { type: "string", minLength: 1, maxLength: 50 },
            systemPrompt: { type: "string", minLength: 1 },
            metadata: { type: "object" },
          },
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
};

export default agentsRoutes;
