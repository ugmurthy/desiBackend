import { getTenantClientService } from "./tenant-client";

export interface ExecutionArtifact {
  path: string;
  toolName: string;
  executionId: string;
  createdAt: string;
}

/**
 * Retrieve artifacts strictly scoped to a single executionId.
 * Only returns artifacts from readFile/writeFile tool sub-steps
 * that belong to the provided execution — no cross-execution leakage.
 */
export async function getExecutionArtifacts(
  tenantId: string,
  executionId: string
): Promise<ExecutionArtifact[]> {
  const client = await getTenantClientService().getClient(tenantId);
  const artifacts: ExecutionArtifact[] = [];

  try {
    const subSteps = await client.executions.getSubSteps(executionId);

    for (const step of subSteps) {
      const typedStep = step as unknown as {
        toolOrPromptName?: string;
        toolOrPromptParams?: string | Record<string, unknown>;
        executionId?: string;
        createdAt?: string;
      };

      // Strict execution scope: skip any step not matching the requested executionId
      if (typedStep.executionId && typedStep.executionId !== executionId) {
        continue;
      }

      if (
        typedStep.toolOrPromptName === "readFile" ||
        typedStep.toolOrPromptName === "writeFile"
      ) {
        let params: Record<string, unknown> = {};

        if (typeof typedStep.toolOrPromptParams === "string") {
          try {
            params = JSON.parse(typedStep.toolOrPromptParams);
          } catch {
            continue;
          }
        } else if (typedStep.toolOrPromptParams) {
          params = typedStep.toolOrPromptParams;
        }

        const filePath = params.path || params.filePath || params.file;
        if (typeof filePath === "string") {
          artifacts.push({
            path: filePath,
            toolName: typedStep.toolOrPromptName,
            executionId,
            createdAt: typedStep.createdAt || new Date().toISOString(),
          });
        }
      }
    }
  } catch {
    // Execution may not have sub-steps yet or may have been deleted
  }

  return artifacts;
}
