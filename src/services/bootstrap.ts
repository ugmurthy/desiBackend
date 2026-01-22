import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";
import { initializeAdminDatabase } from "../db/admin-schema";
import { createSuperAdmin } from "./super-admin";
import { createAdminApiKey } from "./admin-api-key";
import { seedAgentsFromCSV, ensureSeedDirectory } from "./agents-seed";
import { createDefaultTenant } from "./default-tenant";

export interface BootstrapOptions {
  force?: boolean;
}

export interface BootstrapSummary {
  adminCreated: boolean;
  apiKeyCreated: boolean;
  agentsInserted: number;
  agentsSkipped: number;
  agentErrors: number;
  tenantCreated: boolean;
}

const DESI_AGENT_DIR = join(homedir(), ".desiAgent");

/**
 * Ensure the ~/.desiAgent/ directory structure exists
 */
function ensureDirectoryStructure(): void {
  const dirs = [
    DESI_AGENT_DIR,
    join(DESI_AGENT_DIR, "seed"),
    join(DESI_AGENT_DIR, "tenants"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Run the bootstrap process to initialize the desiAgent system
 */
export async function runBootstrap(
  options: BootstrapOptions = {}
): Promise<BootstrapSummary> {
  const { force = false } = options;

  console.log("📁 Ensuring directory structure...");
  ensureDirectoryStructure();
  ensureSeedDirectory();

  console.log("🗄️  Initializing admin database...");
  initializeAdminDatabase();

  console.log("👤 Creating super admin...");
  const adminResult = await createSuperAdmin({}, { force });
  if (adminResult.created) {
    console.log(`   ✅ Super admin created: ${adminResult.admin.email}`);
  } else {
    console.log(`   ⏭️  Super admin already exists: ${adminResult.admin.email}`);
  }

  console.log("🔑 Creating admin API key...");
  const apiKeyResult = await createAdminApiKey(adminResult.admin.id, { force });

  console.log("\n🤖 Seeding agents...");
  const agentsResult = seedAgentsFromCSV();

  console.log("\n🏢 Creating default tenant...");
  const tenantResult = createDefaultTenant({ force });

  const summary: BootstrapSummary = {
    adminCreated: adminResult.created,
    apiKeyCreated: apiKeyResult.created,
    agentsInserted: agentsResult.inserted,
    agentsSkipped: agentsResult.skipped,
    agentErrors: agentsResult.errors.length,
    tenantCreated: tenantResult.created,
  };

  console.log("\n" + "═".repeat(60));
  console.log("📊 Bootstrap Summary");
  console.log("═".repeat(60));
  console.log(`   Super Admin:     ${summary.adminCreated ? "Created" : "Skipped (exists)"}`);
  console.log(`   Admin API Key:   ${summary.apiKeyCreated ? "Created" : "Skipped (exists)"}`);
  console.log(`   Agents:          ${summary.agentsInserted} inserted, ${summary.agentsSkipped} skipped, ${summary.agentErrors} errors`);
  console.log(`   Default Tenant:  ${summary.tenantCreated ? "Created" : "Skipped (exists)"}`);
  console.log("═".repeat(60));

  return summary;
}
