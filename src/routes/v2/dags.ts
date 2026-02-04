import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";
import type { LLMProvider } from "../../config/env";
import { error400Schema, error401Schema, error404Schema } from "./schemas";
import { insertResourceOwnership } from "../../db/user-schema";

interface DagIdParams {
  id: string;
}

interface CreateDagBody {
  goalText: string;
  agentName: string;
  provider?: LLMProvider;
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
  provider?: LLMProvider;
  model?: string;
}

interface ExecuteDefinitionBody {
  definition: Record<string, unknown>;
  originalGoalText: string;
}

interface RunExperimentsBody {
  goalText: string;
  agentName: string;
  provider: LLMProvider;
  models: string[];
  temperatures: number[];
  seed?: number;
}

interface ResumeClarificationBody {
  userResponse: string;
}

const EXECUTION_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: "1 minute",
    },
  },
};

// ============ Shared Schema Definitions ============

const dagIdParamSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", example: "dag_EbvukFKKz6P4CveL-_sj_" },
  },
} as const;

const dagResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string", example: "dag_EbvukFKKz6P4CveL-_sj_" },
    dagTitle: { type: "string", example: "Analyze sales data" },
    status: { type: "string", example: "active" },
    createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
    updatedAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
    metadata: { type: "object", additionalProperties: true, example: {} },
  },
} as const;

const dagListItemSchema = {
  type: "object",
  properties: {
    id: { type: "string", example: "dag_EbvukFKKz6P4CveL-_sj_" },
    dagTitle: { type: "string", example: "Analyze sales data" },
    status: { type: "string", example: "active" },
    createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
    updatedAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
    metadata: { type: "object", example: {} },
  },
} as const;

const dagSuccessResponseSchema = {
  description: "DAG created successfully",
  type: "object",
  properties: {
    status: { type: "string", example: "success" },
    dagId: { type: "string", example: "dag_EbvukFKKz6P4CveL-_sj_" },
    result: { type: "object" },
    usage: { type: "object" },
    generationStats: { type: "object" },
    attempts: { type: "integer", example: 1 },
  },
} as const;

const clarificationRequiredResponseSchema = {
  description: "Clarification required from user",
  type: "object",
  properties: {
    status: { type: "string", example: "clarification_required" },
    clarificationQuery: { type: "string", example: "Please specify the date range for the analysis" },
    result: { type: "object" },
    usage: { type: "object" },
    generationStats: { type: "object" },
  },
} as const;

const executionStartedResponseSchema = {
  description: "Execution started",
  type: "object",
  properties: {
    id: { type: "string", example: "exec_EbvukFKKz6P4CveL-_sj_" },
    status: { type: "string", example: "pending" },
  },
} as const;

const paginationSchema = {
  type: "object",
  properties: {
    total: { type: "integer", example: 50 },
    limit: { type: "integer", example: 20 },
    offset: { type: "integer", example: 0 },
    hasMore: { type: "boolean", example: true },
  },
} as const;

// ============ Helper Functions ============

function mapDagToResponse(dag: Record<string, unknown>) {
  return {
    id: dag.id,
    dagTitle: dag.dagTitle,
    status: dag.status,
    createdAt: dag.createdAt,
    updatedAt: dag.updatedAt,
    metadata: dag.metadata,
  };
}

function mapDagToListItem(dag: Record<string, unknown>) {
  return {
    id: dag.id,
    dagTitle: dag.dagTitle,
    status: dag.status,
    createdAt: dag.createdAt,
    updatedAt: dag.updatedAt,
    metadata: dag.metadata,
  };
}

// ============ Routes ============

const dagsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateDagBody }>(
    "/dags",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["DAGs"],
        summary: "Create DAG from goal",
        description: "Creates a new DAG (Directed Acyclic Graph) from a goal text using an AI agent. The DAG represents a workflow that can be executed to achieve the specified goal.",
        body: {
          type: "object",
          required: ["goalText", "agentName"],
          properties: {
            goalText: { type: "string", minLength: 1, example: "Analyze quarterly sales data and generate insights" },
            agentName: { type: "string", minLength: 1, example: "data-analyst" },
            provider: { type: "string", enum: ["openai", "openrouter", "ollama"], example: "openai" },
            model: { type: "string", example: "gpt-4" },
            temperature: { type: "number", minimum: 0, maximum: 2, example: 0.7 },
            maxTokens: { type: "integer", minimum: 1, example: 4096 },
            seed: { type: "integer", example: 42 },
            cronSchedule: { type: "string", example: "0 9 * * 1" },
            scheduleActive: { type: "boolean", example: true },
            timezone: { type: "string", example: "America/New_York" },
          },
        },
        response: {
          201: dagSuccessResponseSchema,
          202: clarificationRequiredResponseSchema,
          400: { description: "Invalid request body", ...error400Schema },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
          404: { description: "Agent not found", ...error404Schema },
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
        console.log(JSON.stringify(request,null,2), "Backend: Created DAG");
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
          insertResourceOwnership(auth.tenantDb, auth.user.id, "dag", result.dagId);
          return reply.status(201).send({
            status: "success",
            dagId: result.dagId,
          });
        }

        const dagResult = result.result as { id?: string };
        if (dagResult?.id) {
          insertResourceOwnership(auth.tenantDb, auth.user.id, "dag", dagResult.id);
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

  fastify.post<{ Params: DagIdParams; Body: ResumeClarificationBody }>(
    "/dags/:id/resume-clarification",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["DAGs"],
        summary: "Resume DAG creation after clarification",
        description: "Resumes DAG creation for a DAG that returned a clarification_required status. Provide the user's response to the clarification query.",
        params: dagIdParamSchema,
        body: {
          type: "object",
          required: ["userResponse"],
          properties: {
            userResponse: { type: "string", minLength: 1, example: "Use the Q4 2024 data from the sales database" },
          },
        },
        response: {
          201: { ...dagSuccessResponseSchema, description: "DAG created successfully after clarification" },
          202: { ...clarificationRequiredResponseSchema, description: "Additional clarification required" },
          400: { description: "Invalid request body", ...error400Schema },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
          404: { description: "DAG not found", ...error404Schema },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;
      const { userResponse } = request.body;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const result = await client.dags.resumeFromClarification(id, userResponse);

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
        tags: ["DAGs"],
        summary: "List DAGs with filters",
        description: "Retrieves a paginated list of DAGs with optional filtering by status and creation date range.",
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "active", "paused", "completed", "failed", "cancelled"],
              example: "active",
            },
            createdAfter: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
            createdBefore: { type: "string", format: "date-time", example: "2024-12-31T23:59:59Z" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20, example: 20 },
            offset: { type: "integer", minimum: 0, default: 0, example: 0 },
          },
        },
        response: {
          200: {
            description: "List of DAGs retrieved successfully",
            type: "object",
            properties: {
              dags: { type: "array", items: dagListItemSchema },
              pagination: paginationSchema,
            },
          },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
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
        dags: dags.map((dag) => mapDagToListItem(dag as unknown as Record<string, unknown>)),
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
      schema: {
        tags: ["DAGs"],
        summary: "List scheduled DAGs",
        description: "Retrieves all DAGs that have a cron schedule configured, along with their scheduling details.",
        response: {
          200: {
            description: "List of scheduled DAGs retrieved successfully",
            type: "object",
            properties: {
              dags: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "dag_EbvukFKKz6P4CveL-_sj_" },
                    dagTitle: { type: "string", example: "Weekly Sales Report" },
                    cronSchedule: { type: "string", example: "0 9 * * 1" },
                    scheduleDescription: { type: "string", example: "Every Monday at 9:00 AM" },
                    scheduleActive: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
        },
      },
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
        tags: ["DAGs"],
        summary: "Get DAG by ID",
        description: "Retrieves a specific DAG by its unique identifier, including all nodes, edges, and metadata.",
        params: dagIdParamSchema,
        response: {
          200: { description: "DAG retrieved successfully", ...dagResponseSchema },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
          404: { description: "DAG not found", ...error404Schema },
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
        console.log("DAG:",dag.id, dag.dagTitle);
        return mapDagToResponse(dag as unknown as Record<string, unknown>);
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
        tags: ["DAGs"],
        summary: "Update DAG",
        description: "Updates a DAG's properties such as status, schedule, or title. Only the provided fields will be updated.",
        params: dagIdParamSchema,
        body: {
          type: "object",
          properties: {
            status: { type: "string", example: "paused" },
            cronSchedule: { type: ["string", "null"], example: "0 9 * * 1" },
            scheduleActive: { type: "boolean", example: false },
            timezone: { type: "string", example: "America/New_York" },
            dagTitle: { type: "string", example: "Updated Sales Analysis" },
          },
        },
        response: {
          200: { description: "DAG updated successfully", ...dagResponseSchema },
          400: { description: "Invalid request body", ...error400Schema },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
          404: { description: "DAG not found", ...error404Schema },
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
        return mapDagToResponse(dag as unknown as Record<string, unknown>);
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
        tags: ["DAGs"],
        summary: "Delete DAG",
        description: "Safely deletes a DAG by its ID. This operation is idempotent.",
        consumes: ["application/json"],
        params: dagIdParamSchema,
        response: {
          204: { description: "DAG deleted successfully", type: "null" },
          400: { description: "Invalid request", ...error400Schema },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
          404: { description: "DAG not found", ...error404Schema },
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
      ...EXECUTION_RATE_LIMIT,
      preHandler: [authenticate],
      schema: {
        tags: ["DAGs"],
        summary: "Execute a DAG",
        description: "Triggers the execution of an existing DAG. The execution runs asynchronously and returns immediately with an execution ID.",
        params: dagIdParamSchema,
        body: {
          type: "object",
          properties: {
            provider: { type: "string", enum: ["openai", "openrouter", "ollama"], example: "openai" },
            model: { type: "string", example: "gpt-4" },
          },
        },
        response: {
          202: { ...executionStartedResponseSchema, description: "DAG execution started" },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
          404: { description: "DAG not found", ...error404Schema },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;
      const { provider, model } = request.body;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);
      //console.log("[dags/:id/execute] auth", JSON.stringify(auth, null, 2));
      try {
        const result = await client.dags.execute(id, { provider, model });
        insertResourceOwnership(auth.tenantDb, auth.user.id, "execution", result.id);
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
      ...EXECUTION_RATE_LIMIT,
      preHandler: [authenticate],
      schema: {
        tags: ["DAGs"],
        summary: "Execute from definition",
        description: "Executes a DAG directly from a provided definition without saving it first. Useful for testing or one-off executions.",
        body: {
          type: "object",
          required: ["definition", "originalGoalText"],
          properties: {
            definition: {
              type: "object",
              example: {
                nodes: [{ id: "node1", type: "task", config: {} }],
                edges: [],
              },
            },
            originalGoalText: { type: "string", minLength: 1, example: "Analyze sales data for Q4" },
          },
        },
        response: {
          202: { ...executionStartedResponseSchema, description: "DAG execution from definition started" },
          400: { description: "Invalid definition or request body", ...error400Schema },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
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
        insertResourceOwnership(auth.tenantDb, auth.user.id, "execution", result.id);
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
      ...EXECUTION_RATE_LIMIT,
      preHandler: [authenticate],
      schema: {
        tags: ["DAGs"],
        summary: "Run experiments",
        description: "Runs multiple DAG generation experiments with different model and temperature combinations to compare results.",
        body: {
          type: "object",
          required: ["goalText", "agentName", "provider", "models", "temperatures"],
          properties: {
            goalText: { type: "string", minLength: 1, example: "Analyze quarterly sales data" },
            agentName: { type: "string", minLength: 1, example: "data-analyst" },
            provider: { type: "string", enum: ["openai", "openrouter", "ollama"], example: "openai" },
            models: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              example: ["gpt-4", "gpt-3.5-turbo"],
            },
            temperatures: {
              type: "array",
              items: { type: "number", minimum: 0, maximum: 2 },
              minItems: 1,
              example: [0.3, 0.7, 1.0],
            },
            seed: { type: "integer", example: 42 },
          },
        },
        response: {
          202: {
            description: "Experiments started",
            type: "object",
            properties: {
              experimentId: { type: "string", example: "dag_EbvukFKKz6P4CveL-_sj_" },
              totalRuns: { type: "integer", example: 6 },
              status: { type: "string", example: "running" },
            },
          },
          400: { description: "Invalid request body", ...error400Schema },
          401: { description: "Unauthorized - missing or invalid authentication", ...error401Schema },
          404: { description: "Agent not found", ...error404Schema },
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
