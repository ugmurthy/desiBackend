import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import type { Database } from "bun:sqlite";
import { validateApiKey, type ApiKeyInfo } from "../services/api-key";
import { getAdminDatabase, type Tenant, type SuperAdmin, type AdminApiKey } from "../db/admin-schema";
import { getTenantDbPath, type Session } from "../db/user-schema";
import { Database as SqliteDatabase } from "bun:sqlite";
import type { User } from "../db/user-schema";
import { verifyAdminApiKey } from "../services/admin-api-key";

const KEY_PREFIX_LENGTH = 8;
const ADMIN_KEY_PREFIX = "desi_sk_admin_";
const SESSION_PREFIX = "desi_session_";
const SESSION_EXTENSION_DAYS = 7;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
}

export type AuthType = "api_key" | "session";

export interface AuthContext {
  tenant: Tenant;
  user: AuthenticatedUser;
  apiKey: ApiKeyInfo | null;
  tenantDb: Database;
  authType: AuthType;
}

function extractKeyPrefix(fullKey: string): string {
  // Format: desi_sk_{env}_{random} where env is "live" or "test"
  // Find the underscore after the env segment (starting search at position 10)
  const envUnderscorePos = fullKey.indexOf("_", 10);
  if (envUnderscorePos === -1) {
    // Fallback for legacy keys without env segment: "desi_sk_" + 8 chars
    return fullKey.slice(0, 16);
  }
  // Include underscore + 8 random chars
  return fullKey.slice(0, envUnderscorePos + 1 + KEY_PREFIX_LENGTH);
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

interface SessionRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  tenantId: string;
}

interface SessionLookupResult {
  session: SessionRow;
  tenant: Tenant;
  tenantDb: Database;
}

function lookupSessionToken(token: string): SessionLookupResult | null {
  const adminDb = getAdminDatabase();
  const tenantsStmt = adminDb.prepare(`SELECT id, name, slug, status, plan, quotas, createdAt, updatedAt FROM tenants WHERE status = 'active'`);
  const tenants = tenantsStmt.all() as Tenant[];
  const now = Math.floor(Date.now() / 1000);

  for (const tenant of tenants) {
    try {
      const tenantDbPath = getTenantDbPath(tenant.id);
      const tenantDb = new SqliteDatabase(tenantDbPath);
      
      const sessionStmt = tenantDb.prepare(`
        SELECT id, userId, token, expiresAt, createdAt, updatedAt
        FROM sessions
        WHERE token = ? AND expiresAt > ?
      `);
      const session = sessionStmt.get(token, now) as SessionRow | undefined;
      
      if (session) {
        return {
          session: { ...session, tenantId: tenant.id },
          tenant,
          tenantDb,
        };
      }
      tenantDb.close();
    } catch {
      // Tenant DB doesn't exist or can't be opened, continue
    }
  }
  
  return null;
}

function extendSessionExpiry(tenantDb: Database, sessionId: string): void {
  const now = Math.floor(Date.now() / 1000);
  const newExpiry = now + SESSION_EXTENSION_DAYS * 24 * 60 * 60;
  
  const stmt = tenantDb.prepare(`
    UPDATE sessions
    SET expiresAt = ?, updatedAt = ?
    WHERE id = ?
  `);
  stmt.run(newExpiry, now, sessionId);
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
      message: "Invalid Authorization header format. Expected: Bearer <token>",
    });
  }
  
  const token = authHeader.slice(7).trim();
  
  // Detect token type by prefix: desi_session_* = session, desi_sk_* = API key
  if (token.startsWith(SESSION_PREFIX)) {
    // Session-based authentication (US-009)
    const lookupResult = lookupSessionToken(token);
    
    if (!lookupResult) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid or expired session",
      });
    }
    
    const { session, tenant, tenantDb } = lookupResult;
    
    // Get user for this session
    const user = getUserById(tenantDb, session.userId);
    
    if (!user) {
      tenantDb.close();
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "User not found",
      });
    }
    
    // Extend session expiry (sliding window)
    extendSessionExpiry(tenantDb, session.id);
    
    (request as FastifyRequest & { auth: AuthContext }).auth = {
      tenant,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      apiKey: null,
      tenantDb,
      authType: "session",
    };
    return;
  }
  
  // API key authentication
  if (!token.startsWith("desi_sk_")) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid token format",
    });
  }
  
  const keyPrefix = extractKeyPrefix(token);
  
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
  
  const validationResult = await validateApiKey(tenantDb, token);
  
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
    authType: "api_key",
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

export interface AdminAuthContext {
  admin: {
    id: string;
    email: string;
    name: string;
  };
  apiKey: {
    id: string;
    scopes: string[];
  };
}

function getAdminById(adminId: string): SuperAdmin | null {
  const db = getAdminDatabase();
  const stmt = db.prepare(`SELECT * FROM super_admins WHERE id = ?`);
  return stmt.get(adminId) as SuperAdmin | null;
}

export const authenticateAdmin: preHandlerHookHandler = async (
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

  if (!apiKey.startsWith(ADMIN_KEY_PREFIX)) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid admin API key format",
    });
  }

  const adminApiKey = await verifyAdminApiKey(apiKey);

  if (!adminApiKey) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid or expired admin API key",
    });
  }

  if (adminApiKey.revokedAt) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Admin API key has been revoked",
    });
  }

  if (adminApiKey.expiresAt && new Date(adminApiKey.expiresAt) < new Date()) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Admin API key has expired",
    });
  }

  const admin = getAdminById(adminApiKey.adminId);

  if (!admin) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Admin not found",
    });
  }

  const scopes = JSON.parse(adminApiKey.scopes) as string[];

  (request as FastifyRequest & { adminAuth: AdminAuthContext }).adminAuth = {
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
    apiKey: {
      id: adminApiKey.id,
      scopes,
    },
  };

  return;
};
