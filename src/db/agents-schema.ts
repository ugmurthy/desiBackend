import { Database } from "bun:sqlite";

export interface Agent {
  id: string;
  name: string;
  version: string;
  prompt_template: string;
  provider: string | null;
  model: string | null;
  active: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export function initializeAgentsSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      prompt_template TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, version)
    );

    CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
    CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
  `);
}
