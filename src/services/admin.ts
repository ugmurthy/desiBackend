import { getAdminDatabase, type Tenant, type TenantQuotas } from "../db/admin-schema";
import { initializeTenantUserSchema } from "../db/user-schema";
import { initializeApiKeySchema } from "../db/api-key-schema";

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan?: "free" | "pro" | "enterprise";
}

export interface UpdateTenantInput {
  status?: "active" | "suspended" | "pending";
  plan?: "free" | "pro" | "enterprise";
  quotas?: TenantQuotas;
  name?: string;
}

export interface ListTenantsFilter {
  status?: "active" | "suspended" | "pending";
  plan?: "free" | "pro" | "enterprise";
  limit?: number;
  offset?: number;
}

const DEFAULT_QUOTAS: TenantQuotas = {
  maxUsers: 5,
  maxAgents: 10,
  maxExecutionsPerMonth: 1000,
  maxTokensPerMonth: 1000000,
};

const PLAN_QUOTAS: Record<string, TenantQuotas> = {
  free: {
    maxUsers: 5,
    maxAgents: 10,
    maxExecutionsPerMonth: 1000,
    maxTokensPerMonth: 1000000,
  },
  pro: {
    maxUsers: 25,
    maxAgents: 50,
    maxExecutionsPerMonth: 10000,
    maxTokensPerMonth: 10000000,
  },
  enterprise: {
    maxUsers: -1, // unlimited
    maxAgents: -1,
    maxExecutionsPerMonth: -1,
    maxTokensPerMonth: -1,
  },
};

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const db = getAdminDatabase();
  const id = crypto.randomUUID();
  const plan = input.plan || "free";
  const quotas = JSON.stringify(PLAN_QUOTAS[plan] || DEFAULT_QUOTAS);
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO tenants (id, name, slug, status, plan, quotas, createdAt, updatedAt)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
  `);
  stmt.run(id, input.name, input.slug, plan, quotas, now, now);

  // Initialize tenant database with user and api_key schemas
  const tenantDb = await initializeTenantUserSchema(id);
  initializeApiKeySchema(tenantDb);
  tenantDb.close();

  return {
    id,
    name: input.name,
    slug: input.slug,
    status: "active",
    plan,
    quotas,
    createdAt: now,
    updatedAt: now,
  };
}

export function getTenant(id: string): Tenant | null {
  const db = getAdminDatabase();
  const stmt = db.prepare(`SELECT * FROM tenants WHERE id = ?`);
  const tenant = stmt.get(id) as Tenant | null;
  return tenant;
}

export function getTenantBySlug(slug: string): Tenant | null {
  const db = getAdminDatabase();
  const stmt = db.prepare(`SELECT * FROM tenants WHERE slug = ?`);
  const tenant = stmt.get(slug) as Tenant | null;
  return tenant;
}

export function updateTenant(id: string, updates: UpdateTenantInput): Tenant | null {
  const db = getAdminDatabase();
  
  const existing = getTenant(id);
  if (!existing) {
    return null;
  }

  const fields: string[] = [];
  const values: string[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.plan !== undefined) {
    fields.push("plan = ?");
    values.push(updates.plan);
  }
  if (updates.quotas !== undefined) {
    fields.push("quotas = ?");
    values.push(JSON.stringify(updates.quotas));
  }
  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }

  if (fields.length === 0) {
    return existing;
  }

  fields.push("updatedAt = ?");
  values.push(new Date().toISOString());
  values.push(id);

  const stmt = db.prepare(`
    UPDATE tenants SET ${fields.join(", ")} WHERE id = ?
  `);
  stmt.run(...values);

  return getTenant(id);
}

export function listTenants(filters: ListTenantsFilter = {}): { tenants: Tenant[]; total: number } {
  const db = getAdminDatabase();
  
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters.plan) {
    conditions.push("plan = ?");
    params.push(filters.plan);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM tenants ${whereClause}`);
  const countResult = countStmt.get(...params) as { count: number };
  const total = countResult.count;

  // Get paginated results
  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const stmt = db.prepare(`
    SELECT * FROM tenants ${whereClause}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `);
  params.push(limit, offset);
  const tenants = stmt.all(...params) as Tenant[];

  return { tenants, total };
}

export function deleteTenant(id: string): boolean {
  const db = getAdminDatabase();
  const stmt = db.prepare(`DELETE FROM tenants WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}

export function suspendTenant(id: string): Tenant | null {
  return updateTenant(id, { status: "suspended" });
}

export function activateTenant(id: string): Tenant | null {
  return updateTenant(id, { status: "active" });
}
