/**
 * Example Profile Handler — use as a template when creating new handlers.
 *
 * To wire it up:
 *   1. Import and register in telegram-profile-router.ts:
 *        import { CreateOnlyHandler } from "./example-profile-handler.js";
 *        handlerRegistry.set("create-only", new CreateOnlyHandler());
 *
 *   2. Insert a profile row into the admin DB's profile_registry table:
 *        INSERT INTO profile_registry (id, name, description, handler, enabled, createdAt, updatedAt)
 *        VALUES ('uuid-here', 'create-only', 'Creates a DAG without executing', 'create-only', 1, unixepoch(), unixepoch());
 *
 *   3. Users can switch to it via:  /use create-only
 */

import { getTenantClientService } from "./tenant-client.js";
import type { ProfileHandler, ProfileHandlerResult, TelegramAttachment } from "./telegram-profile-router.js";

/**
 * A handler that only *creates* a DAG (decomposes the goal into steps)
 * but does NOT execute it. Useful for review-before-run workflows.
 */
export class CreateOnlyHandler implements ProfileHandler {
  async handleRequest(params: {
    tenantId: string;
    userId: string;
    goalText: string;
    agentName?: string;
    attachment?: TelegramAttachment;
  }): Promise<ProfileHandlerResult> {
    const client = await getTenantClientService().getClient(params.tenantId);

    // Create a DAG from the goal — no execution
    const result = await client.dags.createFromGoal({
      goalText: params.goalText,
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

    // DAG created successfully but NOT executed
    const r = result as { status: string; dagId: string };
    return {
      success: true,
      dagId: r.dagId,
      status: "created",   // signal that it's created but not running
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

    // Clarification resolved — DAG is ready but still NOT executed
    const r = result as { status: "success"; dagId: string };
    return {
      success: true,
      dagId: r.dagId,
      status: "created",
    };
  }
}
