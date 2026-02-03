import { Database } from "bun:sqlite";

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export interface SchemaVersion {
  version: number;
  appliedAt: string;
  name: string;
}

/**
 * Initialize the schema_version table for tracking migrations
 */
export function initializeSchemaVersionTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Get the current schema version
 */
export function getCurrentVersion(db: Database): number {
  try {
    const result = db.prepare(
      "SELECT MAX(version) as version FROM schema_version"
    ).get() as { version: number | null } | undefined;
    return result?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Record a migration as applied
 */
function recordMigration(db: Database, migration: Migration): void {
  const stmt = db.prepare(
    "INSERT INTO schema_version (version, name, appliedAt) VALUES (?, ?, datetime('now'))"
  );
  stmt.run(migration.version, migration.name);
}

/**
 * Run pending migrations on a database
 */
export function runMigrations(
  db: Database,
  migrations: Migration[],
  dbName: string = "database"
): { applied: number; currentVersion: number } {
  initializeSchemaVersionTable(db);
  
  const currentVersion = getCurrentVersion(db);
  const pendingMigrations = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pendingMigrations.length === 0) {
    return { applied: 0, currentVersion };
  }

  console.log(`📦 Running ${pendingMigrations.length} migration(s) on ${dbName}...`);

  for (const migration of pendingMigrations) {
    try {
      console.log(`   ⬆️  Applying migration ${migration.version}: ${migration.name}`);
      migration.up(db);
      recordMigration(db, migration);
    } catch (error) {
      console.error(`   ❌ Migration ${migration.version} failed:`, error);
      throw error;
    }
  }

  const newVersion = getCurrentVersion(db);
  console.log(`   ✅ Migrations complete. Schema version: ${newVersion}`);
  
  return { applied: pendingMigrations.length, currentVersion: newVersion };
}

/**
 * Get migration history for a database
 */
export function getMigrationHistory(db: Database): SchemaVersion[] {
  try {
    initializeSchemaVersionTable(db);
    const stmt = db.prepare("SELECT * FROM schema_version ORDER BY version ASC");
    return stmt.all() as SchemaVersion[];
  } catch {
    return [];
  }
}
