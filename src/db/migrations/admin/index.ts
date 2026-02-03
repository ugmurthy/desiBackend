import type { Migration } from "../../migrations";

/**
 * Admin database migrations
 * 
 * Add new migrations here as the admin schema evolves.
 * Each migration should have a unique, incrementing version number.
 * 
 * Example migration:
 * {
 *   version: 1,
 *   name: "add-feature-flags-table",
 *   up: (db) => {
 *     db.exec(`
 *       CREATE TABLE IF NOT EXISTS feature_flags (
 *         id TEXT PRIMARY KEY,
 *         name TEXT NOT NULL,
 *         enabled INTEGER NOT NULL DEFAULT 0
 *       );
 *     `);
 *   },
 * },
 */
export const adminMigrations: Migration[] = [
  // Initial schema is created in admin-schema.ts
  // Add incremental migrations here as needed
];
