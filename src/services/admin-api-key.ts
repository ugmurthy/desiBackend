import bcrypt from "bcrypt";
import { join } from "path";
import { homedir } from "os";
import { writeFileSync, existsSync, chmodSync } from "fs";
import { getAdminDatabase, type AdminApiKey, type AdminApiKeyScope } from "../db/admin-schema";

const BCRYPT_COST_FACTOR = 12;
const ADMIN_KEY_PREFIX = "desi_sk_admin_";
const ADMIN_KEY_FILE = join(homedir(), ".desiAgent", "admin-key.txt");

export interface CreateAdminApiKeyResult {
  apiKey: AdminApiKey;
  fullKey: string | null;
  created: boolean;
}

function generateRandomChars(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    const byte = randomBytes[i];
    if (byte !== undefined) {
      result += chars[byte % chars.length];
    }
  }
  return result;
}

export function getAdminApiKeyByAdminId(adminId: string): AdminApiKey | null {
  const db = getAdminDatabase();
  const stmt = db.prepare(`SELECT * FROM admin_api_keys WHERE adminId = ? AND revokedAt IS NULL`);
  return stmt.get(adminId) as AdminApiKey | null;
}

export function getAdminApiKeyByPrefix(keyPrefix: string): AdminApiKey | null {
  const db = getAdminDatabase();
  const stmt = db.prepare(`SELECT * FROM admin_api_keys WHERE keyPrefix = ? AND revokedAt IS NULL`);
  return stmt.get(keyPrefix) as AdminApiKey | null;
}

export async function verifyAdminApiKey(fullKey: string): Promise<AdminApiKey | null> {
  const keyPrefix = fullKey.substring(0, ADMIN_KEY_PREFIX.length + 4);
  const existing = getAdminApiKeyByPrefix(keyPrefix);
  if (!existing) {
    return null;
  }

  const valid = await bcrypt.compare(fullKey, existing.keyHash);
  return valid ? existing : null;
}

export async function createAdminApiKey(
  adminId: string,
  options: { force?: boolean } = {}
): Promise<CreateAdminApiKeyResult> {
  const existing = getAdminApiKeyByAdminId(adminId);

  if (existing && !options.force) {
    if (existsSync(ADMIN_KEY_FILE)) {
      console.log("\n⚠️  Admin API key already exists. Use --force to regenerate.");
      return { apiKey: existing, fullKey: null, created: false };
    }
  }

  if (existing && options.force) {
    const db = getAdminDatabase();
    const revokeStmt = db.prepare(`UPDATE admin_api_keys SET revokedAt = ? WHERE id = ?`);
    revokeStmt.run(new Date().toISOString(), existing.id);
  }

  const db = getAdminDatabase();
  const id = crypto.randomUUID();
  const random32 = generateRandomChars(32);
  const fullKey = `${ADMIN_KEY_PREFIX}${random32}`;
  const keyPrefix = `${ADMIN_KEY_PREFIX}${random32.substring(0, 4)}`;
  const keyHash = await bcrypt.hash(fullKey, BCRYPT_COST_FACTOR);
  const scopes: AdminApiKeyScope[] = ["admin", "read", "write", "execute"];
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO admin_api_keys (id, adminId, keyHash, keyPrefix, scopes, expiresAt, createdAt, revokedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, adminId, keyHash, keyPrefix, JSON.stringify(scopes), null, now, null);

  console.log("\n🔑 Admin API Key Generated:");
  console.log("━".repeat(60));
  console.log(`   ${fullKey}`);
  console.log("━".repeat(60));
  console.log("⚠️  Save this key - it won't be shown again!");
  console.log(`📁 Key saved to: ${ADMIN_KEY_FILE}`);

  writeFileSync(ADMIN_KEY_FILE, fullKey, { mode: 0o600 });
  chmodSync(ADMIN_KEY_FILE, 0o600);

  const apiKey: AdminApiKey = {
    id,
    adminId,
    keyHash,
    keyPrefix,
    scopes: JSON.stringify(scopes),
    expiresAt: null,
    createdAt: now,
    revokedAt: null,
  };

  return { apiKey, fullKey, created: true };
}

export function revokeAdminApiKey(id: string): boolean {
  const db = getAdminDatabase();
  const stmt = db.prepare(`UPDATE admin_api_keys SET revokedAt = ? WHERE id = ?`);
  const result = stmt.run(new Date().toISOString(), id);
  return result.changes > 0;
}
