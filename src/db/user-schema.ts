import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";
import { initDB } from "@ugm/desiagent";
import { initializeApiKeySchema } from "./api-key-schema";

export type UserRole = "admin" | "member" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  apiKeyId: string | null;
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
  return db;
}
