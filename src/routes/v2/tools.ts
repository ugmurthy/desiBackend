import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";
import { getTenantClientService } from "../../services/tenant-client";

const toolsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/tools",
    {
      preHandler: [authenticate],
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
