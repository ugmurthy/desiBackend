import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";
import { initDB } from "@ugm/desiagent";
import { initializeApiKeySchema } from "./api-key-schema";
import { runMigrations } from "./migrations";
import { tenantMigrations } from "./migrations/tenant";

export type UserRole = "admin" | "member" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  apiKeyId: string | null;
  passwordHash: string | null;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpiry: number | null;
  passwordResetToken: string | null;
  passwordResetExpiry: number | null;
  inviteToken: string | null;
  inviteExpiry: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: number; // Unix timestamp
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
}

export type AuthLogEvent = "login_success" | "login_failed";

export interface AuthLog {
  id: string;
  tenantId: string;
  email: string;
  event: AuthLogEvent;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: number; // Unix timestamp
}

const TENANT_DB_BASE = join(homedir(), ".desiAgent", "tenants");

export function getTenantDbPath(tenantId: string): string {
  return join(TENANT_DB_BASE, tenantId, "agent.db");
}

export function initializeUserSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      tenantId TEXT NOT NULL,
      apiKeyId TEXT,
      passwordHash TEXT,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      emailVerificationToken TEXT,
      emailVerificationExpiry INTEGER,
      passwordResetToken TEXT,
      passwordResetExpiry INTEGER,
      inviteToken TEXT,
      inviteExpiry INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_tenantId ON users(tenantId);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);
}

export function initializeSessionSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions(expiresAt);
  `);
}

export function initializeAuthLogSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_logs (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      email TEXT NOT NULL,
      event TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_auth_logs_tenantId ON auth_logs(tenantId);
    CREATE INDEX IF NOT EXISTS idx_auth_logs_email ON auth_logs(email);
    CREATE INDEX IF NOT EXISTS idx_auth_logs_event ON auth_logs(event);
    CREATE INDEX IF NOT EXISTS idx_auth_logs_createdAt ON auth_logs(createdAt);
  `);
}

export type ResourceType = "dag" | "execution";

export interface ResourceOwnership {
  id: string;
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
  createdAt: number;
}

export function initializeResourceOwnershipSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_ownership (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      resourceId TEXT NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_ownership_type_id 
      ON resource_ownership(resourceType, resourceId);
    CREATE INDEX IF NOT EXISTS idx_resource_ownership_user_type 
      ON resource_ownership(userId, resourceType);
  `);
}

/**
 * Generate a secure session token (32 bytes, base64url encoded)
 * Returns token with desi_session_ prefix
 */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const base64 = Buffer.from(bytes).toString("base64url");
  return `desi_session_${base64}`;
}

export async function initializeTenantUserSchema(tenantId: string): Promise<Database> {
  const dbPath = getTenantDbPath(tenantId);
  const dbDir = dirname(dbPath);
  
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  const result = await initDB(dbPath, { force: false });
  //console.log("Database initialization result:", JSON.stringify(result,null, 2));
  const db = new Database(dbPath);
  initializeUserSchema(db);
  initializeApiKeySchema(db);
  initializeSessionSchema(db);
  initializeAuthLogSchema(db);
  initializeResourceOwnershipSchema(db);
  
  // Run any pending migrations for this tenant
  runMigrations(db, tenantMigrations, `tenant:${tenantId}`);
  
  return db;
}
