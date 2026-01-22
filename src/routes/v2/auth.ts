import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middleware/authenticate";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/auth/me",
    {
      preHandler: [authenticate],
    },
    async (request) => {
      const auth = request.auth!;

      return {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        role: auth.user.role,
        tenant: {
          id: auth.tenant.id,
          name: auth.tenant.name,
          slug: auth.tenant.slug,
          plan: auth.tenant.plan,
        },
      };
    }
  );
};

export default authRoutes;
