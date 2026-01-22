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

export interface SuperAdmin {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminApiKey {
  id: string;
  adminId: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string; // JSON array
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export type AdminApiKeyScope = "admin" | "read" | "write" | "execute";

export interface Agent {
  id: string;
  name: string;
  version: string;
  promptTemplate: string;
  provider: string | null;
  model: string | null;
  active: number; // SQLite boolean (0 or 1)
  metadata: string | null; // JSON string
  createdAt: string;
  updatedAt: string;
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

    CREATE TABLE IF NOT EXISTS api_key_tenant_map (
      keyPrefix TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_key_tenant_map_tenantId ON api_key_tenant_map(tenantId);

    CREATE TABLE IF NOT EXISTS super_admins (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_super_admins_email ON super_admins(email);

    CREATE TABLE IF NOT EXISTS admin_api_keys (
      id TEXT PRIMARY KEY,
      adminId TEXT NOT NULL,
      keyHash TEXT NOT NULL,
      keyPrefix TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '[]',
      expiresAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      revokedAt TEXT,
      FOREIGN KEY (adminId) REFERENCES super_admins(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_admin_api_keys_adminId ON admin_api_keys(adminId);
    CREATE INDEX IF NOT EXISTS idx_admin_api_keys_keyPrefix ON admin_api_keys(keyPrefix);

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      promptTemplate TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      metadata TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, version)
    );

    CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
    CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
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

export function registerApiKeyTenantMapping(keyPrefix: string, tenantId: string): void {
  const db = getAdminDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO api_key_tenant_map (keyPrefix, tenantId, createdAt)
    VALUES (?, ?, datetime('now'))
  `);
  stmt.run(keyPrefix, tenantId);
}

export function removeApiKeyTenantMapping(keyPrefix: string): void {
  const db = getAdminDatabase();
  const stmt = db.prepare(`DELETE FROM api_key_tenant_map WHERE keyPrefix = ?`);
  stmt.run(keyPrefix);
}
