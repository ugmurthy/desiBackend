import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";

interface ExecutionIdParams {
  id: string;
}

interface ListExecutionsQuery {
  status?: "pending" | "running" | "waiting" | "completed" | "failed" | "partial" | "suspended";
  dagId?: string;
  limit?: number;
  offset?: number;
}

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
                items: {
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
                },
              },
              pagination: {
                type: "object",
                properties: {
                  total: { type: "integer", example: 10 },
                  limit: { type: "integer", example: 20 },
                  offset: { type: "integer", example: 0 },
                  hasMore: { type: "boolean", example: false },
                },
              },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized",
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
        executions: executions.map((exec) => ({
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
        })),
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          200: {
            type: "object",
            description: "Execution details",
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
              finalResult: { type: "object", nullable: true, example: { summary: "Analysis complete" } },
              synthesisResult: { type: "string", nullable: true, example: "Data analysis completed successfully" },
              suspendedReason: { type: "string", nullable: true, example: null },
              suspendedAt: { type: "string", format: "date-time", nullable: true, example: null },
              retryCount: { type: "integer", example: 0 },
              totalUsage: { type: "object", nullable: true, example: { tokens: 1500 } },
              totalCostUsd: { type: "number", nullable: true, example: 0.015 },
              startedAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
              completedAt: { type: "string", format: "date-time", nullable: true, example: "2024-01-01T00:01:00Z" },
              durationMs: { type: "integer", nullable: true, example: 60000 },
              createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
              updatedAt: { type: "string", format: "date-time", example: "2024-01-01T00:01:00Z" },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
          },
          404: {
            type: "object",
            description: "Execution not found",
            properties: {
              statusCode: { type: "integer", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Execution not found" },
            },
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
        const execution = await client.executions.get(id);

        return {
          id: execution.id,
          dagId: execution.dagId,
          originalRequest: execution.originalRequest,
          primaryIntent: execution.primaryIntent,
          status: execution.status,
          totalTasks: execution.totalTasks,
          completedTasks: execution.completedTasks,
          failedTasks: execution.failedTasks,
          waitingTasks: execution.waitingTasks,
          finalResult: execution.finalResult,
          synthesisResult: execution.synthesisResult,
          suspendedReason: execution.suspendedReason,
          suspendedAt: execution.suspendedAt,
          retryCount: execution.retryCount,
          totalUsage: execution.totalUsage,
          totalCostUsd: execution.totalCostUsd,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          durationMs: execution.durationMs,
          createdAt: execution.createdAt,
          updatedAt: execution.updatedAt,
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
    "/executions/:id/details",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Executions"],
        summary: "Get execution with sub-steps",
        description: "Retrieve detailed information about a specific execution including all its sub-steps.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          200: {
            type: "object",
            description: "Execution details with sub-steps",
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
              finalResult: { type: "object", nullable: true, example: { summary: "Analysis complete" } },
              synthesisResult: { type: "string", nullable: true, example: "Data analysis completed successfully" },
              suspendedReason: { type: "string", nullable: true, example: null },
              suspendedAt: { type: "string", format: "date-time", nullable: true, example: null },
              retryCount: { type: "integer", example: 0 },
              totalUsage: { type: "object", nullable: true, example: { tokens: 1500 } },
              totalCostUsd: { type: "number", nullable: true, example: 0.015 },
              startedAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
              completedAt: { type: "string", format: "date-time", nullable: true, example: "2024-01-01T00:01:00Z" },
              durationMs: { type: "integer", nullable: true, example: 60000 },
              createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
              updatedAt: { type: "string", format: "date-time", example: "2024-01-01T00:01:00Z" },
              subSteps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "step-001" },
                    name: { type: "string", example: "Fetch data" },
                    status: { type: "string", example: "completed" },
                    result:{type:"string",example:"..."}
                    //result: { type: "object",additionalProperties: true, nullable: true},
                  },
                },
                example: [{ id: "step-001", name: "Fetch data", status: "completed", result: null }],
              },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
          },
          404: {
            type: "object",
            description: "Execution not found",
            properties: {
              statusCode: { type: "integer", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Execution not found" },
            },
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
        const executionWithSteps = await client.executions.getWithSubSteps(id);

        return {
          id: executionWithSteps.id,
          dagId: executionWithSteps.dagId,
          originalRequest: executionWithSteps.originalRequest,
          primaryIntent: executionWithSteps.primaryIntent,
          status: executionWithSteps.status,
          totalTasks: executionWithSteps.totalTasks,
          completedTasks: executionWithSteps.completedTasks,
          failedTasks: executionWithSteps.failedTasks,
          waitingTasks: executionWithSteps.waitingTasks,
          finalResult: executionWithSteps.finalResult,
          synthesisResult: executionWithSteps.synthesisResult,
          suspendedReason: executionWithSteps.suspendedReason,
          suspendedAt: executionWithSteps.suspendedAt,
          retryCount: executionWithSteps.retryCount,
          totalUsage: executionWithSteps.totalUsage,
          totalCostUsd: executionWithSteps.totalCostUsd,
          startedAt: executionWithSteps.startedAt,
          completedAt: executionWithSteps.completedAt,
          durationMs: executionWithSteps.durationMs,
          createdAt: executionWithSteps.createdAt,
          updatedAt: executionWithSteps.updatedAt,
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          200: {
            type: "object",
            description: "Sub-steps for the execution",
            properties: {
              executionId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
              subSteps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "step-001" },
                    name: { type: "string", example: "Fetch data" },
                    status: { type: "string", example: "completed" },
                    result: {type:"string",example:"..."}
                    //result: { type: "object",additionalProperties: true, nullable: true },
                  },
                },
                example: [{ id: "step-001", name: "Fetch data", status: "completed", result: null }],
              },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
          },
          404: {
            type: "object",
            description: "Execution not found",
            properties: {
              statusCode: { type: "integer", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Execution not found" },
            },
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          204: {
            type: "null",
            description: "Execution deleted successfully",
          },
          401: {
            type: "object",
            description: "Unauthorized",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
          },
          404: {
            type: "object",
            description: "Execution not found",
            properties: {
              statusCode: { type: "integer", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Execution not found" },
            },
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          200: {
            type: "string",
            description: "SSE event stream",
          },
          401: {
            type: "object",
            description: "Unauthorized",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
          },
          404: {
            type: "object",
            description: "Execution not found",
            properties: {
              statusCode: { type: "integer", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Execution not found" },
            },
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          202: {
            type: "object",
            description: "Execution resumed successfully",
            properties: {
              id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
              status: { type: "string", example: "running" },
            },
          },
          400: {
            type: "object",
            description: "Execution is not in a paused state",
            properties: {
              statusCode: { type: "integer", example: 400 },
              error: { type: "string", example: "Bad Request" },
              message: { type: "string", example: "Execution is not in a paused state. Current status: completed" },
            },
          },
          401: {
            type: "object",
            description: "Unauthorized",
            properties: {
              statusCode: { type: "integer", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Invalid or missing authentication token" },
            },
          },
          404: {
            type: "object",
            description: "Execution not found",
            properties: {
              statusCode: { type: "integer", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Execution not found" },
            },
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
