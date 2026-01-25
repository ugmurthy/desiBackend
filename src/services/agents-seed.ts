import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Database } from "bun:sqlite";
import { getTenantDbPath } from "../db/user-schema";
import type { Agent } from "../db/agents-schema";

const SEED_DIR = join(homedir(), ".desiAgent", "seed");
const AGENTS_JSON_PATH = join(SEED_DIR, "agents.json");

export interface SeedAgentsResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

interface SeedAgent {
  id?: string;
  name: string;
  version: string;
  prompt_template: string;
  provider?: string | null;
  model?: string | null;
  active?: boolean | number;
  metadata?: Record<string, unknown> | string | null;
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  
  // Set version 4
  const byte6 = bytes[6];
  const byte8 = bytes[8];
  if (byte6 !== undefined) {
    bytes[6] = (byte6 & 0x0f) | 0x40;
  }
  // Set variant
  if (byte8 !== undefined) {
    bytes[8] = (byte8 & 0x3f) | 0x80;
  }
  
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Check if agent is active
 */
function isActive(active: boolean | number | undefined): boolean {
  if (active === undefined) return true;
  if (typeof active === "boolean") return active;
  if (typeof active === "number") return active !== 0;
  return true;
}

/**
 * Validate and parse an agent object from JSON
 */
function validateAgent(agent: unknown, index: number): { valid: SeedAgent; error: null } | { valid: null; error: string } {
  if (typeof agent !== "object" || agent === null) {
    return { valid: null, error: `Index ${index}: not a valid object` };
  }

  const obj = agent as Record<string, unknown>;

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return { valid: null, error: `Index ${index}: missing or invalid 'name'` };
  }

  if (typeof obj.version !== "string" || !obj.version.trim()) {
    return { valid: null, error: `Index ${index}: missing or invalid 'version'` };
  }

  if (typeof obj.prompt_template !== "string" || !obj.prompt_template.trim()) {
    return { valid: null, error: `Index ${index}: missing or invalid 'prompt_template'` };
  }

  let active: boolean | number | undefined;
  if (typeof obj.active === "boolean" || typeof obj.active === "number") {
    active = obj.active;
  }

  return {
    valid: {
      id: typeof obj.id === "string" ? obj.id : undefined,
      name: obj.name,
      version: obj.version,
      prompt_template: obj.prompt_template,
      provider: typeof obj.provider === "string" ? obj.provider : null,
      model: typeof obj.model === "string" ? obj.model : null,
      active,
      metadata: obj.metadata as SeedAgent["metadata"],
    },
    error: null,
  };
}

/**
 * Seed agents from JSON file into a tenant database
 * @param tenantId - The tenant ID to seed agents into (defaults to "default")
 */
export function seedAgentsFromJSON(tenantId: string = "default"): SeedAgentsResult {
  const result: SeedAgentsResult = {
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  if (!existsSync(AGENTS_JSON_PATH)) {
    console.log(`⚠️  No agents JSON found at ${AGENTS_JSON_PATH}`);
    console.log("   To seed agents, create the file with a JSON array of agent objects");
    return result;
  }

  console.log(`📄 Reading agents from ${AGENTS_JSON_PATH}`);

  let content: string;
  try {
    content = readFileSync(AGENTS_JSON_PATH, "utf-8");
  } catch (error) {
    const errorMsg = `Failed to read JSON file: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
    return result;
  }

  let agents: unknown[];
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      const errorMsg = "Seed file must contain a JSON array";
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      return result;
    }
    agents = parsed;
  } catch (error) {
    const errorMsg = `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
    return result;
  }

  console.log(`   Found ${agents.length} agent(s) in seed file`);
  console.log(`   Seeding into tenant: ${tenantId}`);

  const dbPath = getTenantDbPath(tenantId);
  if (!existsSync(dbPath)) {
    const errorMsg = `Tenant database not found at ${dbPath}. Ensure tenant is created first.`;
    result.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
    return result;
  }

  const db = new Database(dbPath);

  const insertStmt = db.prepare(`
    INSERT INTO agents (id, name, version, prompt_template, provider, model, active, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const checkStmt = db.prepare(`
    SELECT id FROM agents WHERE name = ? AND version = ?
  `);

  for (let i = 0; i < agents.length; i++) {
    const validation = validateAgent(agents[i], i);

    if (!validation.valid) {
      result.errors.push(validation.error);
      console.error(`❌ ${validation.error}`);
      continue;
    }

    const agent = validation.valid;

    if (!isActive(agent.active)) {
      result.skipped++;
      console.log(`   ⏭️  Skipped inactive agent: ${agent.name}@${agent.version}`);
      continue;
    }

    const existing = checkStmt.get(agent.name, agent.version) as { id: string } | null;
    if (existing) {
      result.skipped++;
      console.log(`   ⏭️  Skipped existing agent: ${agent.name}@${agent.version}`);
      continue;
    }

    const id = agent.id || generateUUID();
    const metadataStr = agent.metadata
      ? typeof agent.metadata === "string"
        ? agent.metadata
        : JSON.stringify(agent.metadata)
      : null;

    try {
      insertStmt.run(
        id,
        agent.name,
        agent.version,
        agent.prompt_template,
        agent.provider ?? null,
        agent.model ?? null,
        1,
        metadataStr
      );
      result.inserted++;
      console.log(`   ✅ Inserted agent: ${agent.name}@${agent.version}`);
    } catch (error) {
      const errorMsg = `${agent.name}@${agent.version}: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
    }
  }

  console.log(`\n📊 Agents seeding summary: ${result.inserted} inserted, ${result.skipped} skipped, ${result.errors.length} errors`);

  return result;
}

/**
 * @deprecated Use seedAgentsFromJSON instead. Kept for backward compatibility.
 */
export function seedAgentsFromCSV(tenantId: string = "default"): SeedAgentsResult {
  return seedAgentsFromJSON(tenantId);
}

/**
 * Ensure the seed directory exists
 */
export function ensureSeedDirectory(): void {
  if (!existsSync(SEED_DIR)) {
    mkdirSync(SEED_DIR, { recursive: true });
  }
}

/**
 * Get path to the agents JSON file
 */
export function getAgentsJsonPath(): string {
  return AGENTS_JSON_PATH;
}

/**
 * @deprecated Use getAgentsJsonPath instead
 */
export function getAgentsCsvPath(): string {
  return AGENTS_JSON_PATH;
}
