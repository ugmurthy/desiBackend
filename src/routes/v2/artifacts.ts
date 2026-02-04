import type { FastifyPluginAsync } from "fastify";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";
import { error401Schema } from "./schemas";
import { getOwnedResourceIds, getTenantDbPath } from "../../db/user-schema";

interface Artifact {
  path: string;
  toolName: string;
  executionId: string;
  createdAt: string;
}

interface ArtifactWithContent extends Artifact {
  content: string;
}

interface ArtifactsQuerystring {
  path?: string;
}

function getArtifactsDir(tenantId: string): string {
  const dbPath = getTenantDbPath(tenantId);
  return join(dirname(dbPath), "artifacts");
}

async function readFileContent(filePath: string, artifactsDir: string): Promise<string> {
  const fullPath = join(artifactsDir, filePath);
  return readFile(fullPath, "utf-8");
}

const artifactsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ArtifactsQuerystring }>(
    "/artifacts",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Artifacts"],
        summary: "Get artifacts for authenticated user",
        description: "Retrieve all artifact names (files) created by the authenticated user's executions using readFile or writeFile tools. Optionally provide a path query parameter to get a single artifact with its content.",
        querystring: {
          type: "object",
          properties: {
            path: { type: "string", description: "Optional file path to retrieve content for a specific artifact" },
          },
        },
        response: {
          200: {
            type: "object",
            description: "Returns 'artifacts' array when no path query, or 'artifact' object with content when path is provided",
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
              artifact: {
                type: "object",
                properties: {
                  path: { type: "string", example: "/data/output.json" },
                  toolName: { type: "string", enum: ["readFile", "writeFile"], example: "writeFile" },
                  executionId: { type: "string", example: "exec-123" },
                  createdAt: { type: "string", format: "date-time", example: "2024-01-01T00:00:00Z" },
                  content: { type: "string", example: "{\"key\": \"value\"}" },
                },
              },
            },
          },
          401: error401Schema,
          404: {
            type: "object",
            properties: {
              statusCode: { type: "number", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "Artifact not found" },
            },
          },
          500: {
            type: "object",
            properties: {
              statusCode: { type: "number", example: 500 },
              error: { type: "string", example: "Internal Server Error" },
              message: { type: "string", example: "Failed to read file" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const userId = auth.user.id;
      const { path: requestedPath } = request.query;

      const ownedExecutionIds = getOwnedResourceIds(auth.tenantDb, userId, "execution");
      
      if (ownedExecutionIds.length === 0) {
        if (requestedPath) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Artifact not found",
          });
        }
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

      if (requestedPath) {
        const matchingArtifact = artifacts.find((a) => 
          a.path === requestedPath || 
          a.path.endsWith(`/${requestedPath}`) || 
          a.path === `./${requestedPath}`
        );
        
        if (!matchingArtifact) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: `Artifact not found. Available paths: ${artifacts.map(a => a.path).join(", ")}`,
          });
        }

        try {
          const artifactsDir = getArtifactsDir(auth.tenant.id);
          const content = await readFileContent(matchingArtifact.path, artifactsDir);
          const artifactWithContent: ArtifactWithContent = {
            ...matchingArtifact,
            content,
          };

          return { artifact: artifactWithContent };
        } catch (err) {
          return reply.status(500).send({
            statusCode: 500,
            error: "Internal Server Error",
            message: `Failed to read file: ${err instanceof Error ? err.message : "Unknown error"}`,
          });
        }
      }

      return { artifacts };
    }
  );
};

export default artifactsRoutes;
