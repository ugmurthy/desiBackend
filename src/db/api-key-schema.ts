import type { Database } from "bun:sqlite";

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string; // JSON array
  expiresAt: string | null;
  createdAt: string;
}

export type ApiKeyScope = "read" | "write" | "admin" | "super_admin";

export function initializeApiKeySchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      keyPrefix TEXT NOT NULL,
      keyHash TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '["read", "write"]',
      expiresAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_userId ON api_keys(userId);
    CREATE INDEX IF NOT EXISTS idx_api_keys_keyPrefix ON api_keys(keyPrefix);
  `);
}
