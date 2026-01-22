import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getAdminDatabase, type Agent } from "../db/admin-schema";

const SEED_DIR = join(homedir(), ".desiAgent", "seed");
const AGENTS_CSV_PATH = join(SEED_DIR, "agents.csv");

export interface SeedAgentsResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

/**
 * Parse a CSV line handling quoted fields and escaped characters
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote (doubled)
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ",") {
        fields.push(current.trim());
        current = "";
        i++;
        continue;
      }
      current += char;
      i++;
    }
  }

  // Add the last field
  fields.push(current.trim());

  return fields;
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
 * Seed agents from CSV file into admin database
 */
export function seedAgentsFromCSV(): SeedAgentsResult {
  const result: SeedAgentsResult = {
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  // Check if CSV file exists
  if (!existsSync(AGENTS_CSV_PATH)) {
    console.log(`⚠️  No agents CSV found at ${AGENTS_CSV_PATH}`);
    console.log("   To seed agents, create the file or copy scripts/example-agents.csv");
    return result;
  }

  console.log(`📄 Reading agents from ${AGENTS_CSV_PATH}`);

  let content: string;
  try {
    content = readFileSync(AGENTS_CSV_PATH, "utf-8");
  } catch (error) {
    const errorMsg = `Failed to read CSV file: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
    return result;
  }

  const lines = content.split("\n");
  const db = getAdminDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO agents (id, name, version, promptTemplate, provider, model, active, metadata, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let headerSkipped = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const rawLine = lines[lineNum];
    if (rawLine === undefined) continue;
    const line = rawLine.trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith("#")) {
      continue;
    }

    // Skip header row (first non-comment, non-empty line)
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }

    const fields = parseCSVLine(line);
    
    // Expected columns: id, name, version, promptTemplate, provider, model, active, metadata
    if (fields.length < 4) {
      const errorMsg = `Line ${lineNum + 1}: Insufficient fields (need at least name, version, promptTemplate)`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      continue;
    }

    const [idField, name, version, promptTemplate, provider, model, activeField, metadata] = fields;

    // Validate required fields
    if (!name) {
      const errorMsg = `Line ${lineNum + 1}: Missing required field 'name'`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      continue;
    }

    if (!version) {
      const errorMsg = `Line ${lineNum + 1}: Missing required field 'version'`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      continue;
    }

    if (!promptTemplate) {
      const errorMsg = `Line ${lineNum + 1}: Missing required field 'promptTemplate'`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      continue;
    }

    // Generate UUID if not provided
    const id = idField || generateUUID();

    // Parse active field (default to 1 if not provided)
    const active = activeField === "" || activeField === undefined ? 1 : parseInt(activeField, 10) || 0;

    try {
      insertStmt.run(
        id,
        name,
        version,
        promptTemplate,
        provider || null,
        model || null,
        active,
        metadata || null
      );
      result.inserted++;
      console.log(`   ✅ Inserted agent: ${name}@${version}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        result.skipped++;
        console.log(`   ⏭️  Skipped existing agent: ${name}@${version}`);
      } else {
        const errorMsg = `Line ${lineNum + 1}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }
  }

  console.log(`\n📊 Agents seeding summary: ${result.inserted} inserted, ${result.skipped} skipped, ${result.errors.length} errors`);

  return result;
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
 * Get path to the agents CSV file
 */
export function getAgentsCsvPath(): string {
  return AGENTS_CSV_PATH;
}
