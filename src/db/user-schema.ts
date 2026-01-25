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

export async function initializeTenantUserSchema(tenantId: string): Promise<Database> {
  const dbPath = getTenantDbPath(tenantId);
  const dbDir = dirname(dbPath);
  
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  const result = await initDB(dbPath, { force: false });
  console.log("Database initialization result:", JSON.stringify(result,null, 2));
  const db = new Database(dbPath);
  initializeUserSchema(db);
  initializeApiKeySchema(db);
  return db;
}
