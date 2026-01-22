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
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "running", "waiting", "completed", "failed", "partial", "suspended"],
            },
            dagId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
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
};

export default executionsRoutes;
