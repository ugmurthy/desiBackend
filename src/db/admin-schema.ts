import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "pending";
  plan: "free" | "pro" | "enterprise";
  quotas: string; // JSON string
  createdAt: string;
  updatedAt: string;
}

export interface TenantQuotas {
  maxUsers?: number;
  maxAgents?: number;
  maxExecutionsPerMonth?: number;
  maxTokensPerMonth?: number;
}

const ADMIN_DB_DIR = join(homedir(), ".desiAgent");
const ADMIN_DB_PATH = join(ADMIN_DB_DIR, "admin.db");

let adminDb: Database | null = null;

export function getAdminDbPath(): string {
  return ADMIN_DB_PATH;
}

export function initializeAdminDatabase(): Database {
  if (adminDb) {
    return adminDb;
  }

  if (!existsSync(ADMIN_DB_DIR)) {
    mkdirSync(ADMIN_DB_DIR, { recursive: true });
  }

  adminDb = new Database(ADMIN_DB_PATH);

  adminDb.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      plan TEXT NOT NULL DEFAULT 'free',
      quotas TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
  `);

  return adminDb;
}

export function getAdminDatabase(): Database {
  if (!adminDb) {
    return initializeAdminDatabase();
  }
  return adminDb;
}

export function closeAdminDatabase(): void {
  if (adminDb) {
    adminDb.close();
    adminDb = null;
  }
}
