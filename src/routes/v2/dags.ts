import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";

interface DagIdParams {
  id: string;
}

interface CreateDagBody {
  goalText: string;
  agentName: string;
  provider?: "openai" | "openrouter" | "ollama";
  model?: string;
  temperature?: number;
  maxTokens?: number;
  seed?: number;
  cronSchedule?: string;
  scheduleActive?: boolean;
  timezone?: string;
}

interface UpdateDagBody {
  status?: string;
  cronSchedule?: string | null;
  scheduleActive?: boolean;
  timezone?: string;
  dagTitle?: string;
}

interface ListDagsQuery {
  status?: "pending" | "active" | "paused" | "completed" | "failed" | "cancelled";
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  offset?: number;
}

interface ExecuteDagBody {
  provider?: "openai" | "openrouter" | "ollama";
  model?: string;
}

interface ExecuteDefinitionBody {
  definition: Record<string, unknown>;
  originalGoalText: string;
}

interface RunExperimentsBody {
  goalText: string;
  agentName: string;
  provider: "openai" | "openrouter" | "ollama";
  models: string[];
  temperatures: number[];
  seed?: number;
}

const dagsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateDagBody }>(
    "/dags",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["goalText", "agentName"],
          properties: {
            goalText: { type: "string", minLength: 1 },
            agentName: { type: "string", minLength: 1 },
            provider: { type: "string", enum: ["openai", "openrouter", "ollama"] },
            model: { type: "string" },
            temperature: { type: "number", minimum: 0, maximum: 2 },
            maxTokens: { type: "integer", minimum: 1 },
            seed: { type: "integer" },
            cronSchedule: { type: "string" },
            scheduleActive: { type: "boolean" },
            timezone: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const {
        goalText,
        agentName,
        provider,
        model,
        temperature,
        maxTokens,
        seed,
        cronSchedule,
        scheduleActive,
        timezone,
      } = request.body;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const result = await client.dags.createFromGoal({
          goalText,
          agentName,
          provider,
          model,
          temperature,
          maxTokens,
          seed,
          cronSchedule,
          scheduleActive,
          timezone,
        });

        if (result.status === "clarification_required") {
          return reply.status(202).send({
            status: "clarification_required",
            clarificationQuery: result.clarificationQuery,
            result: result.result,
            usage: result.usage,
            generationStats: result.generationStats,
          });
        }

        if ("dagId" in result) {
          return reply.status(201).send({
            status: "success",
            dagId: result.dagId,
          });
        }

        return reply.status(201).send({
          status: "success",
          result: result.result,
          usage: result.usage,
          generationStats: result.generationStats,
          attempts: result.attempts,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: error.message,
          });
        }
        if (error instanceof Error && error.name === "ValidationError") {
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

  fastify.get<{ Querystring: ListDagsQuery }>(
    "/dags",
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "active", "paused", "completed", "failed", "cancelled"],
            },
            createdAfter: { type: "string", format: "date-time" },
            createdBefore: { type: "string", format: "date-time" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { status, createdAfter, createdBefore, limit = 20, offset = 0 } = request.query;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      const filter: Record<string, unknown> = {};
      if (status) {
        filter.status = status;
      }
      if (createdAfter) {
        filter.createdAfter = new Date(createdAfter);
      }
      if (createdBefore) {
        filter.createdBefore = new Date(createdBefore);
      }
      filter.limit = limit;
      filter.offset = offset;

      const dags = await client.dags.list(filter);

      return {
        dags: dags.map((dag) => ({
          id: dag.id,
          objective: dag.objective,
          status: dag.status,
          createdAt: dag.createdAt,
          updatedAt: dag.updatedAt,
          metadata: dag.metadata,
        })),
        pagination: {
          total: dags.length,
          limit,
          offset,
          hasMore: dags.length === limit,
        },
      };
    }
  );

  fastify.get(
    "/dags/scheduled",
    {
      preHandler: [authenticate],
    },
    async (request) => {
      const auth = request.auth!;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      const scheduledDags = await client.dags.listScheduled();

      return {
        dags: scheduledDags.map((dag) => ({
          id: dag.id,
          dagTitle: dag.dagTitle,
          cronSchedule: dag.cronSchedule,
          scheduleDescription: dag.scheduleDescription,
          scheduleActive: dag.scheduleActive,
        })),
      };
    }
  );

  fastify.get<{ Params: DagIdParams }>(
    "/dags/:id",
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

        return {
          id: dag.id,
          objective: dag.objective,
          nodes: dag.nodes,
          edges: dag.edges,
          status: dag.status,
          createdAt: dag.createdAt,
          updatedAt: dag.updatedAt,
          metadata: dag.metadata,
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

  fastify.patch<{ Params: DagIdParams; Body: UpdateDagBody }>(
    "/dags/:id",
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
            status: { type: "string" },
            cronSchedule: { type: ["string", "null"] },
            scheduleActive: { type: "boolean" },
            timezone: { type: "string" },
            dagTitle: { type: "string" },
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
        const dag = await client.dags.update(id, updates);

        return {
          id: dag.id,
          objective: dag.objective,
          nodes: dag.nodes,
          edges: dag.edges,
          status: dag.status,
          createdAt: dag.createdAt,
          updatedAt: dag.updatedAt,
          metadata: dag.metadata,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "DAG not found",
          });
        }
        if (error instanceof Error && error.name === "ValidationError") {
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

  fastify.delete<{ Params: DagIdParams }>(
    "/dags/:id",
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
        await client.dags.safeDelete(id);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "DAG not found",
          });
        }
        if (error instanceof Error && error.name === "ValidationError") {
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

  fastify.post<{ Params: DagIdParams; Body: ExecuteDagBody }>(
    "/dags/:id/execute",
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
            provider: { type: "string", enum: ["openai", "openrouter", "ollama"] },
            model: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;
      const { provider, model } = request.body;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const result = await client.dags.execute(id, { provider, model });
        return reply.status(202).send({
          id: result.id,
          status: result.status,
        });
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

  fastify.post<{ Body: ExecuteDefinitionBody }>(
    "/dags/execute-definition",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["definition", "originalGoalText"],
          properties: {
            definition: { type: "object" },
            originalGoalText: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { definition, originalGoalText } = request.body;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const result = await client.dags.executeDefinition({
          definition,
          originalGoalText,
        });
        return reply.status(202).send({
          id: result.id,
          status: result.status,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "ValidationError") {
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

  fastify.post<{ Body: RunExperimentsBody }>(
    "/dags/experiments",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          required: ["goalText", "agentName", "provider", "models", "temperatures"],
          properties: {
            goalText: { type: "string", minLength: 1 },
            agentName: { type: "string", minLength: 1 },
            provider: { type: "string", enum: ["openai", "openrouter", "ollama"] },
            models: { type: "array", items: { type: "string" }, minItems: 1 },
            temperatures: { type: "array", items: { type: "number", minimum: 0, maximum: 2 }, minItems: 1 },
            seed: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { goalText, agentName, provider, models, temperatures, seed } = request.body;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const result = await client.dags.runExperiments({
          goalText,
          agentName,
          provider,
          models,
          temperatures,
          seed,
        });
        return reply.status(202).send(result);
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: error.message,
          });
        }
        if (error instanceof Error && error.name === "ValidationError") {
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

export default dagsRoutes;
