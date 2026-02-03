import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";
import { error400Schema, error401Schema, error404Schema } from "./schemas";

interface ExecutionIdParams {
  id: string;
}

interface ListExecutionsQuery {
  status?: "pending" | "running" | "waiting" | "completed" | "failed" | "partial" | "suspended";
  dagId?: string;
  limit?: number;
  offset?: number;
}

// ============ Shared Schema Definitions ============

const executionIdParamSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
  },
} as const;

const executionSummarySchema = {
  type: "object",
  properties: {
    id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
    dagId: { type: "string", example: "660e8400-e29b-41d4-a716-446655440001" },
    originalRequest: { type: "string", example: "Analyze data" },
    primaryIntent: { type: "string", example: "data_analysis" },
    status: { type: "string", example: "completed" },
    totalTasks: { type: "integer", example: 5 },
    completedTasks: { type: "integer", example: 5 },
    failedTasks: { type: "integer", example: 0 },
    waitingTasks: { type: "integer", example: 0 },
    startedAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
    completedAt: { type: "string", format: "date-time", nullable: true, example: "2024-01-01T00:01:00Z" },
    durationMs: { type: "integer", nullable: true, example: 60000 },
    createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
  },
} as const;

const executionDetailSchema = {
  type: "object",
  description: "Execution details",
  properties: {
    ...executionSummarySchema.properties,
    finalResult: { type: "object", nullable: true, example: { summary: "Analysis complete" } },
    synthesisResult: { type: "string", nullable: true, example: "Data analysis completed successfully" },
    suspendedReason: { type: "string", nullable: true, example: null },
    suspendedAt: { type: "string", format: "date-time", nullable: true, example: null },
    retryCount: { type: "integer", example: 0 },
    totalUsage: { type: "object", nullable: true, example: { tokens: 1500 } },
    totalCostUsd: { type: "number", nullable: true, example: 0.015 },
    updatedAt: { type: "string", format: "date-time", example: "2024-01-01T00:01:00Z" },
  },
} as const;

const subStepSchema = {
  type: "object",
  properties: {
    id: { type: "string", example: "step-001" },
    executionId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
    taskId: { type: "string", example: "task-001" },
    description: { type: "string", example: "Fetch data from API" },
    thought: { type: "string", example: "Need to retrieve data first" },
    actionType: { type: "string", enum: ["tool", "inference"], example: "tool" },
    toolOrPromptName: { type: "string", example: "fetchData" },
    toolOrPromptParams: { type: "object", nullable: true, additionalProperties: true, example: { url: "https://api.example.com" } },
    dependencies: { type: "array", items: { type: "string" }, example: [] },
    status: { type: "string", enum: ["pending", "running", "waiting", "completed", "failed"], example: "completed" },
    startedAt: { type: "string", format: "date-time", nullable: true, example: "2024-01-01T00:00:00Z" },
    completedAt: { type: "string", format: "date-time", nullable: true, example: "2024-01-01T00:00:30Z" },
    durationMs: { type: "integer", nullable: true, example: 30000 },
    result: { type: "string", nullable: true, additionalProperties: true },
    error: { type: "string", nullable: true, example: null },
    usage: {
      type: "object",
      nullable: true,
      properties: {
        promptTokens: { type: "integer", example: 100 },
        completionTokens: { type: "integer", example: 50 },
        totalTokens: { type: "integer", example: 150 },
      },
    },
    costUsd: { type: "string", nullable: true, example: "0.0015" },
    generationStats: { type: "object", nullable: true, additionalProperties: true },
    createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
    updatedAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:30Z" },
  },
} as const;

const paginationSchema = {
  type: "object",
  properties: {
    total: { type: "integer", example: 10 },
    limit: { type: "integer", example: 20 },
    offset: { type: "integer", example: 0 },
    hasMore: { type: "boolean", example: false },
  },
} as const;

// ============ Helper Functions ============

function mapExecutionToSummary(exec: Record<string, unknown>) {
  return {
    id: exec.id,
    dagId: exec.dagId,
    originalRequest: exec.originalRequest,
    primaryIntent: exec.primaryIntent,
    status: exec.status,
    totalTasks: exec.totalTasks,
    completedTasks: exec.completedTasks,
    failedTasks: exec.failedTasks,
    waitingTasks: exec.waitingTasks,
    startedAt: exec.startedAt,
    completedAt: exec.completedAt,
    durationMs: exec.durationMs,
    createdAt: exec.createdAt,
  };
}

function mapExecutionToDetail(exec: Record<string, unknown>) {
  return {
    ...mapExecutionToSummary(exec),
    finalResult: exec.finalResult,
    synthesisResult: exec.synthesisResult,
    suspendedReason: exec.suspendedReason,
    suspendedAt: exec.suspendedAt,
    retryCount: exec.retryCount,
    totalUsage: exec.totalUsage,
    totalCostUsd: exec.totalCostUsd,
    updatedAt: exec.updatedAt,
  };
}

// ============ Routes ============

const executionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ListExecutionsQuery }>(
    "/executions",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Executions"],
        summary: "List executions",
        description: "Retrieve a paginated list of executions with optional filters for status and DAG ID.",
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "running", "waiting", "completed", "failed", "partial", "suspended"],
              example: "completed",
            },
            dagId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20, example: 20 },
            offset: { type: "integer", minimum: 0, default: 0, example: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            description: "List of executions with pagination",
            properties: {
              executions: {
                type: "array",
                items: executionSummarySchema,
              },
              pagination: paginationSchema,
            },
          },
          401: error401Schema,
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { status, dagId, limit = 20, offset = 0 } = request.query;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      const filter: Record<string, unknown> = {};
      if (status) {
        filter.status = status;
      }
      if (dagId) {
        filter.dagId = dagId;
      }
      filter.limit = limit;
      filter.offset = offset;

      const executions = await client.executions.list(filter);

      return {
        executions: executions.map((exec) => mapExecutionToSummary(exec as unknown as Record<string, unknown>)),
        pagination: {
          total: executions.length,
          limit,
          offset,
          hasMore: executions.length === limit,
        },
      };
    }
  );

  fastify.get<{ Params: ExecutionIdParams }>(
    "/executions/:id",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Executions"],
        summary: "Get execution by ID",
        description: "Retrieve detailed information about a specific execution by its unique identifier.",
        params: executionIdParamSchema,
        response: {
          200: executionDetailSchema,
          401: error401Schema,
          404: error404Schema,
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const execution = await client.executions.get(id);
        return mapExecutionToDetail(execution as unknown as Record<string, unknown>);
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Execution not found",
          });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Params: ExecutionIdParams }>(
    "/executions/:id/details",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Executions"],
        summary: "Get execution with sub-steps",
        description: "Retrieve detailed information about a specific execution including all its sub-steps.",
        params: executionIdParamSchema,
        response: {
          200: {
            type: "object",
            description: "Execution details with sub-steps",
            properties: {
              ...executionDetailSchema.properties,
              subSteps: {
                type: "array",
                items: subStepSchema,
              },
            },
          },
          401: error401Schema,
          404: error404Schema,
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const executionWithSteps = await client.executions.getWithSubSteps(id);
        return {
          ...mapExecutionToDetail(executionWithSteps as unknown as Record<string, unknown>),
          subSteps: executionWithSteps.subSteps,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Execution not found",
          });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Params: ExecutionIdParams }>(
    "/executions/:id/sub-steps",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Executions"],
        summary: "Get execution sub-steps",
        description: "Retrieve only the sub-steps for a specific execution.",
        params: executionIdParamSchema,
        response: {
          200: {
            type: "object",
            description: "Sub-steps for the execution",
            properties: {
              executionId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
              subSteps: {
                type: "array",
                items: subStepSchema,
              },
            },
          },
          401: error401Schema,
          404: error404Schema,
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const subSteps = await client.executions.getSubSteps(id);
        return {
          executionId: id,
          subSteps,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Execution not found",
          });
        }
        throw error;
      }
    }
  );

  fastify.delete<{ Params: ExecutionIdParams }>(
    "/executions/:id",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Executions"],
        summary: "Delete execution",
        description: "Delete a specific execution by its unique identifier.",
        consumes: ["application/json"],
        params: executionIdParamSchema,
        response: {
          204: {
            type: "null",
            description: "Execution deleted successfully",
          },
          401: error401Schema,
          404: error404Schema,
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        await client.executions.delete(id);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Execution not found",
          });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Params: ExecutionIdParams }>(
    "/executions/:id/events",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Executions"],
        summary: "Stream execution events",
        description: "Stream real-time execution events via Server-Sent Events (SSE). The stream will close when the execution completes or fails.",
        params: executionIdParamSchema,
        response: {
          200: {
            type: "string",
            description: "SSE event stream",
          },
          401: error401Schema,
          404: error404Schema,
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        await client.executions.get(id);
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Execution not found",
          });
        }
        throw error;
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      try {
        for await (const event of client.executions.streamEvents(id)) {
          const data = JSON.stringify(event);
          reply.raw.write(`data: ${data}\n\n`);
        }
      } catch (error) {
        const errorData = JSON.stringify({ error: "Stream error", message: (error as Error).message });
        reply.raw.write(`event: error\ndata: ${errorData}\n\n`);
      } finally {
        reply.raw.end();
      }
    }
  );

  fastify.post<{ Params: ExecutionIdParams }>(
    "/executions/:id/resume",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Executions"],
        summary: "Resume suspended execution",
        description: "Resume a suspended or waiting execution. Only executions in 'suspended' or 'waiting' status can be resumed.",
        params: executionIdParamSchema,
        response: {
          202: {
            type: "object",
            description: "Execution resumed successfully",
            properties: {
              id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
              status: { type: "string", example: "running" },
            },
          },
          400: error400Schema,
          401: error401Schema,
          404: error404Schema,
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      try {
        const execution = await client.executions.get(id);
        
        if (execution.status !== "suspended" && execution.status !== "waiting") {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: `Execution is not in a paused state. Current status: ${execution.status}`,
          });
        }

        const result = await client.dags.resume(id);
        return reply.status(202).send({
          id: result.id,
          status: result.status,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundError") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Execution not found",
          });
        }
        throw error;
      }
    }
  );
};

export default executionsRoutes;
