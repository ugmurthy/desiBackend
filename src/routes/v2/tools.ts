import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";
import { error401Schema } from "./schemas";

const toolsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/tools",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Tools"],
        summary: "List available tools",
        description: "Retrieves a list of all available tools for the authenticated tenant",
        response: {
          200: {
            type: "object",
            properties: {
              tools: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    parameters: { type: "object" },
                  },
                },
              },
            },
            example: {
              tools: [
                {
                  name: "search",
                  description: "Search for information",
                  parameters: { type: "object", properties: { query: { type: "string" } } },
                },
              ],
            },
          },
          401: error401Schema,
        },
      },
    },
    async (request) => {
      const auth = request.auth!;

      const clientService = getTenantClientService();
      const client = await clientService.getClient(auth.tenant.id);

      const tools = await client.tools.list();

      return {
        tools: tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        })),
      };
    }
  );
};

export default toolsRoutes;
