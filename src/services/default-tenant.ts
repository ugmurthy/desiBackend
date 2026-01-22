import { getAdminDatabase, type Tenant } from "../db/admin-schema";
import { initializeTenantUserSchema } from "../db/user-schema";

const DEFAULT_TENANT_ID = "default";
const DEFAULT_TENANT_NAME = "default";
const DEFAULT_TENANT_SLUG = "default";

export interface CreateDefaultTenantOptions {
  force?: boolean;
}

export interface CreateDefaultTenantResult {
  tenant: Tenant;
  created: boolean;
}

export function getDefaultTenant(): Tenant | null {
  const db = getAdminDatabase();
  const stmt = db.prepare("SELECT * FROM tenants WHERE slug = ?");
  const tenant = stmt.get(DEFAULT_TENANT_SLUG) as Tenant | undefined;
  return tenant ?? null;
}

export function createDefaultTenant(
  options: CreateDefaultTenantOptions = {}
): CreateDefaultTenantResult {
  const { force = false } = options;
  const db = getAdminDatabase();

  const existingTenant = getDefaultTenant();

  if (existingTenant && !force) {
    console.log("⏭️  Default tenant already exists, skipping creation");
    return { tenant: existingTenant, created: false };
  }

  if (existingTenant && force) {
    console.log("🔄 Force mode: Updating default tenant");
    const updateStmt = db.prepare(`
      UPDATE tenants 
      SET status = ?, plan = ?, updatedAt = datetime('now')
      WHERE slug = ?
    `);
    updateStmt.run("active", "free", DEFAULT_TENANT_SLUG);

    initializeTenantUserSchema(DEFAULT_TENANT_ID);
    console.log("✅ Default tenant updated and database re-initialized");

    const updatedTenant = getDefaultTenant()!;
    return { tenant: updatedTenant, created: false };
  }

  console.log("📦 Creating default tenant...");

  const insertStmt = db.prepare(`
    INSERT INTO tenants (id, name, slug, status, plan, quotas, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const quotas = JSON.stringify({});
  insertStmt.run(
    DEFAULT_TENANT_ID,
    DEFAULT_TENANT_NAME,
    DEFAULT_TENANT_SLUG,
    "active",
    "free",
    quotas
  );

  initializeTenantUserSchema(DEFAULT_TENANT_ID);

  console.log("✅ Default tenant created with database at ~/.desiAgent/tenants/default/agent.db");

  const newTenant = getDefaultTenant()!;
  return { tenant: newTenant, created: true };
}
