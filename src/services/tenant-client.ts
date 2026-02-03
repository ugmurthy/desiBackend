import { setupDesiAgent } from "@ugm/desiagent";
import type { DesiAgentClient, DesiAgentConfig } from "@ugm/desiagent";
import { getTenantDbPath, initializeTenantUserSchema } from "../db/user-schema.js";

interface TenantClientOptions {
  llmProvider: "openai" | "openrouter" | "ollama";
  openaiApiKey?: string;
  openrouterApiKey?: string;
  ollamaBaseUrl?: string;
  modelName: string;
  logLevel?: "debug" | "info" | "warn" | "error";
}

class TenantClientService {
  private clients: Map<string, DesiAgentClient> = new Map();
  private options: TenantClientOptions;

  constructor(options: TenantClientOptions) {
    this.options = options;
  }

  async getClient(tenantId: string): Promise<DesiAgentClient> {
    const existing = this.clients.get(tenantId);
    if (existing) {
      return existing;
    }

    // Ensure schema and migrations are applied before desiagent accesses the DB
    const tenantDb = await initializeTenantUserSchema(tenantId);
    tenantDb.close();

    const databasePath = getTenantDbPath(tenantId);
    
    const config: DesiAgentConfig = {
      databasePath,
      llmProvider: this.options.llmProvider,
      openaiApiKey: this.options.openaiApiKey,
      openrouterApiKey: this.options.openrouterApiKey,
      ollamaBaseUrl: this.options.ollamaBaseUrl,
      modelName: this.options.modelName,
      logLevel: this.options.logLevel ?? "info",
      autoStartScheduler: false,
    };

    const client = await setupDesiAgent(config);
    console.log(`[TenantClientService] DesiAgent version: ${client.version ?? "unknown"} initialized for tenant: ${tenantId}`);
    this.clients.set(tenantId, client);

    return client;
  }

  async removeClient(tenantId: string): Promise<void> {
    const client = this.clients.get(tenantId);
    if (client) {
      await client.shutdown();
      this.clients.delete(tenantId);
    }
  }

  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.clients.entries()).map(
      async ([tenantId, client]) => {
        await client.shutdown();
        this.clients.delete(tenantId);
      }
    );
    await Promise.all(shutdownPromises);
  }
}

let tenantClientService: TenantClientService | null = null;

export function initializeTenantClientService(
  options: TenantClientOptions
): TenantClientService {
  if (!tenantClientService) {
    tenantClientService = new TenantClientService(options);
  }
  return tenantClientService;
}

export function getTenantClientService(): TenantClientService {
  if (!tenantClientService) {
    throw new Error(
      "TenantClientService not initialized. Call initializeTenantClientService first."
    );
  }
  return tenantClientService;
}

export { TenantClientService, type TenantClientOptions };
