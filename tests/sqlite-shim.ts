/**
 * SQLite compatibility shim for vitest (runs under Node, not Bun).
 *
 * Mirrors the pattern from @ugm/desiagent's src/db/sqlite.ts:
 * try bun:sqlite first, fall back to node:sqlite (Node ≥ 22).
 *
 * The wrapper exposes a bun:sqlite-compatible API surface so that
 * source code and helpers using `new Database(path)` work unchanged.
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ---------- node:sqlite → bun:sqlite adapter ----------

class NodeStatement {
  private stmt: any;
  private db: any;

  constructor(stmt: any, db: any) {
    this.stmt = stmt;
    this.db = db;
  }

  run(...params: unknown[]) {
    const result = this.stmt.run(...params);
    return { changes: result?.changes ?? 0 };
  }

  get(...params: unknown[]) {
    return this.stmt.get(...params) ?? null;
  }

  all(...params: unknown[]) {
    return this.stmt.all(...params);
  }
}

class NodeCompatDatabase {
  private db: any;

  constructor(path: string) {
    const { DatabaseSync } = require("node:sqlite");
    this.db = new DatabaseSync(path);
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  prepare(sql: string) {
    return new NodeStatement(this.db.prepare(sql), this.db);
  }

  run(sql: string, params?: unknown[]) {
    const stmt = this.db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return { changes: result?.changes ?? 0 };
  }

  query(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      get: (...params: unknown[]) => stmt.get(...params) ?? null,
      all: (...params: unknown[]) => stmt.all(...params),
    };
  }

  close() {
    this.db.close();
  }

  transaction(fn: (...args: unknown[]) => unknown) {
    return (...args: unknown[]) => {
      this.exec("BEGIN");
      try {
        const result = fn(...args);
        this.exec("COMMIT");
        return result;
      } catch (err) {
        this.exec("ROLLBACK");
        throw err;
      }
    };
  }
}

// ---------- Export the right constructor ----------

let DatabaseCtor: any;

try {
  DatabaseCtor = require("bun:sqlite").Database;
} catch {
  DatabaseCtor = NodeCompatDatabase;
}

export const Database = DatabaseCtor;
