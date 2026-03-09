import type { Migration } from "../../migrations";

/**
 * Tenant database migrations
 * 
 * Add new migrations here as the tenant schema evolves.
 * Each migration should have a unique, incrementing version number.
 * These run on each tenant's agent.db when accessed.
 */
export const tenantMigrations: Migration[] = [
  {
    version: 1,
    name: "add-user-auth-columns",
    up: (db) => {
      // Get existing columns
      const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
      const existingCols = new Set(columns.map((c) => c.name));

      const newColumns = [
        { name: "passwordHash", sql: "ALTER TABLE users ADD COLUMN passwordHash TEXT" },
        { name: "emailVerified", sql: "ALTER TABLE users ADD COLUMN emailVerified INTEGER NOT NULL DEFAULT 0" },
        { name: "emailVerificationToken", sql: "ALTER TABLE users ADD COLUMN emailVerificationToken TEXT" },
        { name: "emailVerificationExpiry", sql: "ALTER TABLE users ADD COLUMN emailVerificationExpiry INTEGER" },
        { name: "passwordResetToken", sql: "ALTER TABLE users ADD COLUMN passwordResetToken TEXT" },
        { name: "passwordResetExpiry", sql: "ALTER TABLE users ADD COLUMN passwordResetExpiry INTEGER" },
        { name: "inviteToken", sql: "ALTER TABLE users ADD COLUMN inviteToken TEXT" },
        { name: "inviteExpiry", sql: "ALTER TABLE users ADD COLUMN inviteExpiry INTEGER" },
      ];

      for (const col of newColumns) {
        if (!existingCols.has(col.name)) {
          db.exec(col.sql);
        }
      }
    },
  },
  {
    version: 2,
    name: "backfill-telegram-resource-ownership",
    up: (db) => {
      // Backfill resource_ownership for DAGs and executions created via Telegram
      // that were never recorded in the ownership table.
      const rows = db.prepare(`
        SELECT ti.userId, tr.dagId, tr.executionId
        FROM telegram_requests tr
        JOIN telegram_identities ti ON tr.telegramIdentityId = ti.id
        WHERE ti.userId IS NOT NULL
          AND (tr.dagId IS NOT NULL OR tr.executionId IS NOT NULL)
      `).all() as { userId: string; dagId: string | null; executionId: string | null }[];

      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO resource_ownership (id, userId, resourceType, resourceId)
        VALUES (?, ?, ?, ?)
      `);

      for (const row of rows) {
        if (row.dagId) {
          insertStmt.run(crypto.randomUUID(), row.userId, "dag", row.dagId);
        }
        if (row.executionId) {
          insertStmt.run(crypto.randomUUID(), row.userId, "execution", row.executionId);
        }
      }
    },
  },
];
