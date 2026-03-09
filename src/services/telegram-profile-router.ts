import { getAdminDatabase } from "../db/admin-schema.js";
import { getTenantClientService } from "./tenant-client.js";
import type { ProfileRegistry, TelegramIdentity } from "../db/telegram-schema.js";

// --- Types ---

export interface ProfileHandlerResult {
  success: boolean;
  dagId?: string;
  executionId?: string;
  status?: string;
  clarificationQuery?: string;
  error?: string;
}

export interface ProfileHandler {
  handleRequest(params: {
    tenantId: string;
    userId: string;
    goalText: string;
    agentName?: string;
  }): Promise<ProfileHandlerResult>;

  handleClarification(params: {
    tenantId: string;
    dagId: string;
    userResponse: string;
  }): Promise<ProfileHandlerResult>;
}

// --- DefaultProfileHandler ---

class DefaultProfileHandler implements ProfileHandler {
  async handleRequest(params: {
    tenantId: string;
    userId: string;
    goalText: string;
    agentName?: string;
  }): Promise<ProfileHandlerResult> {
    const client = await getTenantClientService().getClient(params.tenantId);
    const goalText = `${params.goalText}\nWrite the final report to a markdown file.`;
    const result = await client.dags.createAndExecuteFromGoal({
      goalText,
      agentName: params.agentName ?? process.env.DEFAULT_AGENT_NAME ?? "DecomposerV8",
    });

    if (result.status === "clarification_required") {
      const r = result as { status: "clarification_required"; dagId: string; clarificationQuery: string };
      return {
        success: false,
        status: "clarification_required",
        dagId: r.dagId,
        clarificationQuery: r.clarificationQuery,
      };
    }

    if (result.status === "validation_error") {
      const r = result as { status: "validation_error"; dagId: string };
      return {
        success: false,
        status: "validation_error",
        dagId: r.dagId,
        error: "Goal validation failed",
      };
    }

    const r = result as { status: string; dagId: string; executionId: string };
    return {
      success: true,
      dagId: r.dagId,
      executionId: r.executionId,
      status: r.status,
    };
  }

  async handleClarification(params: {
    tenantId: string;
    dagId: string;
    userResponse: string;
  }): Promise<ProfileHandlerResult> {
    const client = await getTenantClientService().getClient(params.tenantId);
    const result = await client.dags.resumeFromClarification(
      params.dagId,
      params.userResponse,
    );

    if (result.status === "clarification_required") {
      const r = result as { status: "clarification_required"; dagId: string; clarificationQuery: string };
      return {
        success: false,
        status: "clarification_required",
        dagId: r.dagId,
        clarificationQuery: r.clarificationQuery,
      };
    }

    if (result.status === "validation_error") {
      const r = result as { status: "validation_error"; dagId: string };
      return {
        success: false,
        status: "validation_error",
        dagId: r.dagId,
        error: "Goal validation failed after clarification",
      };
    }

    // Clarification resolved — now execute the DAG
    const r = result as { status: "success"; dagId: string };
    const dagId = r.dagId;
    const execResult = await client.dags.execute(dagId);
    return {
      success: true,
      dagId,
      executionId: execResult.id,
      status: execResult.status,
    };
  }
}

// --- Handler registry ---

const handlerRegistry = new Map<string, ProfileHandler>();
handlerRegistry.set("create-and-execute", new DefaultProfileHandler());

// --- Lookup functions ---

export function resolveHandler(profileId: string): ProfileHandler | null {
  const db = getAdminDatabase();
  const row = db
    .prepare("SELECT handler FROM profile_registry WHERE id = ?")
    .get(profileId) as Pick<ProfileRegistry, "handler"> | null;

  if (!row) return null;

  return handlerRegistry.get(row.handler) ?? null;
}

export function getDefaultProfileId(): string | null {
  const db = getAdminDatabase();
  const row = db
    .prepare("SELECT id FROM profile_registry WHERE name = 'default' AND enabled = 1")
    .get() as Pick<ProfileRegistry, "id"> | null;

  return row?.id ?? null;
}

export function resolveProfileForIdentity(identity: TelegramIdentity): string | null {
  if (identity.activeProfileId) {
    return identity.activeProfileId;
  }
  return getDefaultProfileId();
}
