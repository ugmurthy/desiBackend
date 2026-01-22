import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import type { Database } from "bun:sqlite";
import { validateApiKey, type ApiKeyInfo } from "../services/api-key";
import { getAdminDatabase, type Tenant } from "../db/admin-schema";
import { getTenantDbPath } from "../db/user-schema";
import { Database as SqliteDatabase } from "bun:sqlite";
import type { User } from "../db/user-schema";

const KEY_PREFIX_LENGTH = 8;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
}

export interface AuthContext {
  tenant: Tenant;
  user: AuthenticatedUser;
  apiKey: ApiKeyInfo;
  tenantDb: Database;
}

function extractKeyPrefix(fullKey: string): string {
  return fullKey.slice(0, fullKey.indexOf("_", 10) + 1 + KEY_PREFIX_LENGTH);
}

function getTenantByApiKeyPrefix(keyPrefix: string): Tenant | null {
  const adminDb = getAdminDatabase();
  
  const stmt = adminDb.prepare(`
    SELECT t.id, t.name, t.slug, t.status, t.plan, t.quotas, t.createdAt, t.updatedAt
    FROM tenants t
    JOIN api_key_tenant_map m ON t.id = m.tenantId
    WHERE m.keyPrefix = ?
  `);
  
  const result = stmt.get(keyPrefix) as Tenant | undefined;
  return result ?? null;
}

function getTenantById(tenantId: string): Tenant | null {
  const adminDb = getAdminDatabase();
  
  const stmt = adminDb.prepare(`
    SELECT id, name, slug, status, plan, quotas, createdAt, updatedAt
    FROM tenants
    WHERE id = ?
  `);
  
  const result = stmt.get(tenantId) as Tenant | undefined;
  return result ?? null;
}

function getUserById(tenantDb: Database, userId: string): User | null {
  const stmt = tenantDb.prepare(`
    SELECT id, email, name, role, createdAt, updatedAt
    FROM users
    WHERE id = ?
  `);
  
  const result = stmt.get(userId) as User | undefined;
  return result ?? null;
}

export const authenticate: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Missing Authorization header",
    });
  }
  
  if (!authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid Authorization header format. Expected: Bearer <api_key>",
    });
  }
  
  const apiKey = authHeader.slice(7).trim();
  
  if (!apiKey.startsWith("desi_sk_")) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid API key format",
    });
  }
  
  const keyPrefix = extractKeyPrefix(apiKey);
  
  const tenant = getTenantByApiKeyPrefix(keyPrefix);
  
  if (!tenant) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid API key",
    });
  }
  
  if (tenant.status !== "active") {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: `Tenant is ${tenant.status}`,
    });
  }
  
  const tenantDbPath = getTenantDbPath(tenant.id);
  let tenantDb: Database;
  
  try {
    tenantDb = new SqliteDatabase(tenantDbPath);
  } catch {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid API key",
    });
  }
  
  const validationResult = await validateApiKey(tenantDb, apiKey);
  
  if (!validationResult.valid) {
    tenantDb.close();
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: validationResult.reason,
    });
  }
  
  const user = getUserById(tenantDb, validationResult.userId);
  
  if (!user) {
    tenantDb.close();
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "User not found",
    });
  }
  
  (request as FastifyRequest & { auth: AuthContext }).auth = {
    tenant,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    apiKey: validationResult.apiKey,
    tenantDb,
  };
};

export function ensureRole(...allowedRoles: AuthenticatedUser["role"][]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as FastifyRequest & { auth: AuthContext }).auth;
    
    if (!auth) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication required",
      });
    }
    
    if (!allowedRoles.includes(auth.user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
      });
    }
  };
}
