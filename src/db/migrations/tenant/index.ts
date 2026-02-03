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
];
