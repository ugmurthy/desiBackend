import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
}

export type UserRole = User["role"];

const TENANTS_DIR = join(homedir(), ".desiAgent", "tenants");

export function getTenantDbPath(tenantId: string): string {
  return join(TENANTS_DIR, tenantId, "agent.db");
}

export function initializeTenantUserSchema(tenantId: string): Database {
  const tenantDir = join(TENANTS_DIR, tenantId);

  if (!existsSync(tenantDir)) {
    mkdirSync(tenantDir, { recursive: true });
  }

  const dbPath = getTenantDbPath(tenantId);
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);

  return db;
}
