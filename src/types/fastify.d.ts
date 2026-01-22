import type { Database } from "bun:sqlite";
import type { DesiAgentClient } from "@ugm/desiagent";
import type { Tenant } from "../db/admin-schema";
import type { AuthenticatedUser } from "../middleware/authenticate";
import type { ApiKeyInfo } from "../services/api-key";

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      tenant: Tenant;
      user: AuthenticatedUser;
      apiKey: ApiKeyInfo;
      tenantDb: Database;
    };
    tenantContext?: {
      tenant: Tenant;
      user: AuthenticatedUser;
      desiClient: DesiAgentClient;
    };
  }
}
