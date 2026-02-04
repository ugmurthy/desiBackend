#!/usr/bin/env bun
/**
 * Migration script for assigning ownership of existing DAGs and executions.
 * Assigns all existing resources to user ugmurthy@gmail.com.
 * 
 * Usage: bun run migrate:ownership
 * 
 * This script is idempotent - safe to run multiple times.
 */

import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { homedir } from "os";
import { existsSync, readdirSync } from "fs";
import {
  getTenantDbPath,
  initializeResourceOwnershipSchema,
} from "../src/db/user-schema";

const TARGET_EMAIL = "ugmurthy@gmail.com";
const TENANT_DB_BASE = join(homedir(), ".desiAgent", "tenants");

interface MigrationResult {
  tenantId: string;
  userId: string | null;
  dagsCount: number;
  executionsCount: number;
  skipped: boolean;
  error?: string;
}

function migrateOwnership(
  db: Database,
  userId: string,
  resourceType: "dag" | "execution",
  tableName: string
): number {
  const resources = db
    .prepare(`SELECT id FROM ${tableName}`)
    .all() as { id: string }[];

  let migrated = 0;

  for (const resource of resources) {
    const existing = db
      .prepare(
        `SELECT 1 FROM resource_ownership 
         WHERE resourceType = ? AND resourceId = ? LIMIT 1`
      )
      .get(resourceType, resource.id);

    if (!existing) {
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO resource_ownership (id, userId, resourceType, resourceId)
         VALUES (?, ?, ?, ?)`
      ).run(id, userId, resourceType, resource.id);
      migrated++;
    }
  }

  return migrated;
}

async function migrateTenant(tenantId: string): Promise<MigrationResult> {
  const dbPath = getTenantDbPath(tenantId);

  if (!existsSync(dbPath)) {
    return {
      tenantId,
      userId: null,
      dagsCount: 0,
      executionsCount: 0,
      skipped: true,
      error: "Database file not found",
    };
  }

  const db = new Database(dbPath);

  try {
    initializeResourceOwnershipSchema(db);

    const user = db
      .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
      .get(TARGET_EMAIL) as { id: string } | undefined;

    if (!user) {
      db.close();
      return {
        tenantId,
        userId: null,
        dagsCount: 0,
        executionsCount: 0,
        skipped: true,
        error: `User ${TARGET_EMAIL} not found in tenant`,
      };
    }

    const dagsCount = migrateOwnership(db, user.id, "dag", "dags");
    const executionsCount = migrateOwnership(db, user.id, "execution", "executions");

    db.close();

    return {
      tenantId,
      userId: user.id,
      dagsCount,
      executionsCount,
      skipped: false,
    };
  } catch (error) {
    db.close();
    return {
      tenantId,
      userId: null,
      dagsCount: 0,
      executionsCount: 0,
      skipped: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  console.log("🔄 Ownership Migration Script");
  console.log(`   Target user: ${TARGET_EMAIL}`);
  console.log("");

  if (!existsSync(TENANT_DB_BASE)) {
    console.log("❌ No tenants directory found at", TENANT_DB_BASE);
    process.exit(1);
  }

  const tenantDirs = readdirSync(TENANT_DB_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  console.log(`📁 Found ${tenantDirs.length} tenant(s)\n`);

  let totalDags = 0;
  let totalExecutions = 0;
  let tenantsProcessed = 0;

  for (const tenantId of tenantDirs) {
    console.log(`Processing tenant: ${tenantId}`);

    const result = await migrateTenant(tenantId);

    if (result.skipped) {
      console.log(`   ⏭️  Skipped: ${result.error}`);
    } else {
      console.log(`   ✅ Migrated ${result.dagsCount} DAG(s), ${result.executionsCount} execution(s)`);
      console.log(`   👤 Assigned to userId: ${result.userId}`);
      totalDags += result.dagsCount;
      totalExecutions += result.executionsCount;
      tenantsProcessed++;
    }
    console.log("");
  }

  console.log("━".repeat(50));
  console.log("📊 Migration Summary:");
  console.log(`   Tenants processed: ${tenantsProcessed}`);
  console.log(`   Total DAGs migrated: ${totalDags}`);
  console.log(`   Total executions migrated: ${totalExecutions}`);
  console.log("\n✅ Migration completed successfully!");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });
