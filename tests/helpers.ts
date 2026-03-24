/**
 * Shared test helpers for building a test Fastify app with real
 * admin DB, tenant DB, users, and API keys — no mocks for the
 * backend's own auth/DB layer.
 */
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import bcrypt from "bcrypt";
import { initializeAdminDatabase, getAdminDatabase } from "../src/db/admin-schema";
import { getTenantDbPath } from "../src/db/user-schema";
import { bootstrapTenant } from "../src/services/admin";
import { createApiKey } from "../src/services/api-key";

// ---- Admin DB helpers (in-process, real SQLite) ----

const DATA_DIR = process.env.DESI_DATA_DIR || homedir();
const ADMIN_DB_DIR = join(DATA_DIR, ".desiAgent");

/**
 * Ensure admin DB directory exists and initialise schemas.
 * Returns the singleton admin Database the app modules will use.
 */
export function ensureAdminDb() {
  if (!existsSync(ADMIN_DB_DIR)) {
    mkdirSync(ADMIN_DB_DIR, { recursive: true });
  }
  return initializeAdminDatabase();
}

/**
 * Create a super-admin + admin API key directly in the admin DB.
 * Returns the plain-text admin API key for use in Authorization headers.
 */
export async function createTestSuperAdmin(
  db: any,
  opts: { email?: string; name?: string } = {}
): Promise<{ adminId: string; adminApiKey: string }> {
  const adminId = crypto.randomUUID();
  const email = opts.email ?? "admin@test.local";
  const name = opts.name ?? "Test Admin";
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash("admin-password", 4);

  db.prepare(`INSERT INTO super_admins (id, email, name, passwordHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(adminId, email, name, passwordHash, now, now);

  // Generate admin API key
  const keyRandom = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  const fullKey = `desi_sk_admin_${keyRandom}`;
  const keyPrefix = `desi_sk_admin_${keyRandom.slice(0, 4)}`;
  const keyHash = await bcrypt.hash(fullKey, 4);
  const keyId = crypto.randomUUID();
  const scopes = JSON.stringify(["admin", "read", "write", "execute"]);

  db.prepare(`INSERT INTO admin_api_keys (id, adminId, keyHash, keyPrefix, scopes, createdAt) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(keyId, adminId, keyHash, keyPrefix, scopes, now);

  return { adminId, adminApiKey: fullKey };
}

/**
 * Bootstrap a tenant + admin user + API key using the admin service.
 * Returns everything needed to make authenticated requests.
 */
export async function createTestTenant(
  opts: { slug?: string; name?: string; adminEmail?: string } = {}
): Promise<{
  tenantId: string;
  userId: string;
  apiKey: string;
  tenantSlug: string;
}> {
  const slug = opts.slug ?? `test-${crypto.randomUUID().slice(0, 8)}`;
  const result = await bootstrapTenant({
    slug,
    name: opts.name ?? "Test Tenant",
    plan: "free",
    adminEmail: opts.adminEmail ?? "user@test.local",
    adminName: "Test User",
  });

  return {
    tenantId: result.tenant.id,
    userId: result.admin.id,
    apiKey: result.apiKey.fullKey,
    tenantSlug: slug,
  };
}

/**
 * Create a second user in an existing tenant DB.
 */
export function createTestUser(
  tenantId: string,
  opts: { email?: string; name?: string; role?: string } = {}
): { userId: string } {
  const dbPath = getTenantDbPath(tenantId);
  const db = new Database(dbPath);
  const userId = crypto.randomUUID();
  const email = opts.email ?? `member-${userId.slice(0, 6)}@test.local`;
  const name = opts.name ?? "Test Member";
  const role = opts.role ?? "member";

  db.prepare(`INSERT INTO users (id, email, name, role, tenantId) VALUES (?, ?, ?, ?, ?)`)
    .run(userId, email, name, role, tenantId);
  db.close();

  return { userId };
}

/**
 * Create an API key for an existing user in a tenant DB.
 * Returns the plain-text key.
 */
export async function createApiKeyForUser(
  tenantId: string,
  userId: string,
  keyName = "test-key"
): Promise<string> {
  const dbPath = getTenantDbPath(tenantId);
  const db = new Database(dbPath);

  const result = await createApiKey(db, tenantId, { userId, name: keyName });
  db.close();
  return result.fullKey;
}
