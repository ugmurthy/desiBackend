import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import type { DesiAgentClient } from "@ugm/desiagent";
import { getTenantClientService } from "../services/tenant-client";
import type { Tenant } from "../db/admin-schema";
import type { AuthenticatedUser } from "../middleware/authenticate";

export interface TenantContext {
  tenant: Tenant;
  user: AuthenticatedUser;
  desiClient: DesiAgentClient;
}

const tenantPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("tenantContext", undefined);

  fastify.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const auth = request.auth;

    if (!auth) {
      return;
    }

    const clientService = getTenantClientService();
    const desiClient = await clientService.getClient(auth.tenant.id);

    request.tenantContext = {
      tenant: auth.tenant,
      user: auth.user,
      desiClient,
    };
  });
};

export default fp(tenantPlugin, {
  name: "tenant-context",
  dependencies: [],
});
