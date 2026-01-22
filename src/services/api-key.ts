import type { Database } from "bun:sqlite";
import { hash, compare } from "bcrypt";
import { randomUUID } from "crypto";
import type { ApiKey, ApiKeyScope } from "../db/api-key-schema";

const SALT_ROUNDS = 10;
const KEY_PREFIX_LENGTH = 8;

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  scopes?: ApiKeyScope[];
  expiresAt?: Date | null;
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  keyPrefix: string;
  fullKey: string; // Only returned once at creation
  scopes: ApiKeyScope[];
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyInfo {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  expiresAt: string | null;
  createdAt: string;
}

function generateApiKey(env: "live" | "test" = "live"): string {
  const random = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return `desi_sk_${env}_${random}`;
}

export async function createApiKey(
  db: Database,
  input: CreateApiKeyInput
): Promise<CreateApiKeyResult> {
  const id = randomUUID();
  const fullKey = generateApiKey("live");
  const keyPrefix = fullKey.slice(0, fullKey.indexOf("_", 10) + 1 + KEY_PREFIX_LENGTH);
  const keyHash = await hash(fullKey, SALT_ROUNDS);
  const scopes = input.scopes ?? ["read", "write"];
  const expiresAt = input.expiresAt ? input.expiresAt.toISOString() : null;
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO api_keys (id, userId, name, keyPrefix, keyHash, scopes, expiresAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.userId,
    input.name,
    keyPrefix,
    keyHash,
    JSON.stringify(scopes),
    expiresAt,
    createdAt
  );

  return {
    id,
    name: input.name,
    keyPrefix,
    fullKey,
    scopes,
    expiresAt,
    createdAt,
  };
}

export async function validateApiKey(
  db: Database,
  fullKey: string
): Promise<{ valid: true; apiKey: ApiKeyInfo; userId: string } | { valid: false; reason: string }> {
  const keyPrefix = fullKey.slice(0, fullKey.indexOf("_", 10) + 1 + KEY_PREFIX_LENGTH);

  const stmt = db.prepare(`
    SELECT id, userId, name, keyPrefix, keyHash, scopes, expiresAt, createdAt
    FROM api_keys
    WHERE keyPrefix = ?
  `);

  const rows = stmt.all(keyPrefix) as ApiKey[];

  for (const row of rows) {
    const isValid = await compare(fullKey, row.keyHash);
    if (isValid) {
      if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
        return { valid: false, reason: "API key has expired" };
      }

      const apiKey: ApiKeyInfo = {
        id: row.id,
        userId: row.userId,
        name: row.name,
        keyPrefix: row.keyPrefix,
        scopes: JSON.parse(row.scopes) as ApiKeyScope[],
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      };

      return { valid: true, apiKey, userId: row.userId };
    }
  }

  return { valid: false, reason: "Invalid API key" };
}

export function listApiKeys(db: Database, userId: string): ApiKeyInfo[] {
  const stmt = db.prepare(`
    SELECT id, userId, name, keyPrefix, scopes, expiresAt, createdAt
    FROM api_keys
    WHERE userId = ?
    ORDER BY createdAt DESC
  `);

  const rows = stmt.all(userId) as Omit<ApiKey, "keyHash">[];

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: JSON.parse(row.scopes) as ApiKeyScope[],
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }));
}

export function revokeApiKey(db: Database, id: string, userId: string): boolean {
  const stmt = db.prepare(`
    DELETE FROM api_keys
    WHERE id = ? AND userId = ?
  `);

  const result = stmt.run(id, userId);
  return result.changes > 0;
}
