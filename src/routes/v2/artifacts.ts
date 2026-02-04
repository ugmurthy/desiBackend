import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";
import { error401Schema, error403Schema } from "./schemas";
import { getOwnedResourceIds } from "../../db/user-schema";

interface ArtifactUserIdParams {
  userId: string;
}

interface Artifact {
  path: string;
  toolName: string;
  executionId: string;
  createdAt: string;
}

const artifactsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: ArtifactUserIdParams }>(
    "/artifacts/:userId",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Artifacts"],
        summary: "Get artifacts by user",
        description: "Retrieve all artifact names (files) created by the user's executions using readFile or writeFile tools.",
        params: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: { type: "string", example: "user-123" },
          },
        },
        response: {
          200: {
            type: "object",
            description: "List of artifacts",
            properties: {
              artifacts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    path: { type: "string", example: "/data/output.json" },
                    toolName: { type: "string", enum: ["readFile", "writeFile"], example: "writeFile" },
                    executionId: { type: "string", example: "exec-123" },
                    createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
                  },
                },
              },
            },
          },
          401: error401Schema,
          403: error403Schema,
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { userId } = request.params;

      if (auth.user.id !== userId) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You can only access your own artifacts",
        });
      }

      const ownedExecutionIds = getOwnedResourceIds(auth.tenantDb, auth.user.id, "execution");
      
      if (ownedExecutionIds.length === 0) {
        return { artifacts: [] };
      }

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      const artifacts: Artifact[] = [];

      for (const executionId of ownedExecutionIds) {
        try {
          const subSteps = await client.executions.getSubSteps(executionId);
          
          for (const step of subSteps) {
            const typedStep = step as unknown as {
              toolOrPromptName?: string;
              toolOrPromptParams?: string | Record<string, unknown>;
              createdAt?: string;
            };
            
            if (typedStep.toolOrPromptName === "readFile" || typedStep.toolOrPromptName === "writeFile") {
              let params: Record<string, unknown> = {};
              
              if (typeof typedStep.toolOrPromptParams === "string") {
                try {
                  params = JSON.parse(typedStep.toolOrPromptParams);
                } catch {
                  continue;
                }
              } else if (typedStep.toolOrPromptParams) {
                params = typedStep.toolOrPromptParams;
              }
              
              const filePath = params.path || params.filePath || params.file;
              if (typeof filePath === "string") {
                artifacts.push({
                  path: filePath,
                  toolName: typedStep.toolOrPromptName,
                  executionId,
                  createdAt: typedStep.createdAt || new Date().toISOString(),
                });
              }
            }
          }
        } catch {
          // Execution may have been deleted, skip it
        }
      }

      return { artifacts };
    }
  );
};

export default artifactsRoutes;
