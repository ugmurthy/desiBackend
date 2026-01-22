import bcrypt from "bcrypt";
import { getAdminDatabase, type SuperAdmin } from "../db/admin-schema";

const BCRYPT_COST_FACTOR = 12;
const DEFAULT_ADMIN_EMAIL = "admin@desiagent.local";
const DEFAULT_ADMIN_NAME = "Super Admin";

export interface CreateSuperAdminInput {
  email?: string;
  name?: string;
  password?: string;
}

export interface CreateSuperAdminResult {
  admin: SuperAdmin;
  created: boolean;
}

export function getSuperAdminByEmail(email: string): SuperAdmin | null {
  const db = getAdminDatabase();
  const stmt = db.prepare(`SELECT * FROM super_admins WHERE email = ?`);
  return stmt.get(email) as SuperAdmin | null;
}

export function getSuperAdmin(id: string): SuperAdmin | null {
  const db = getAdminDatabase();
  const stmt = db.prepare(`SELECT * FROM super_admins WHERE id = ?`);
  return stmt.get(id) as SuperAdmin | null;
}

export async function createSuperAdmin(
  input: CreateSuperAdminInput = {},
  options: { force?: boolean } = {}
): Promise<CreateSuperAdminResult> {
  const email = input.email || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  const name = input.name || process.env.ADMIN_NAME || DEFAULT_ADMIN_NAME;

  const existing = getSuperAdminByEmail(email);

  if (existing && !options.force) {
    return { admin: existing, created: false };
  }

  const db = getAdminDatabase();
  const id = existing?.id || crypto.randomUUID();
  const password = input.password || crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
  const now = new Date().toISOString();

  if (existing && options.force) {
    const stmt = db.prepare(`
      UPDATE super_admins 
      SET name = ?, passwordHash = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(name, passwordHash, now, id);

    return {
      admin: { ...existing, name, passwordHash, updatedAt: now },
      created: false,
    };
  }

  const stmt = db.prepare(`
    INSERT INTO super_admins (id, email, name, passwordHash, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, email, name, passwordHash, now, now);

  return {
    admin: {
      id,
      email,
      name,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    },
    created: true,
  };
}

export async function verifySuperAdminPassword(
  email: string,
  password: string
): Promise<SuperAdmin | null> {
  const admin = getSuperAdminByEmail(email);
  if (!admin) {
    return null;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  return valid ? admin : null;
}
