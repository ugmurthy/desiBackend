import type { FastifyPluginAsync } from "fastify";
import { access, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "path";
import { authenticate, ensureRole } from "../../middleware/authenticate";
import { error401Schema, error403Schema, error404Schema } from "./schemas";

interface SkillParams {
  skillname: string;
}

const SKILL_DOC_NAME = "SKILL.md";

const skillDirectoryCandidates = [
  resolve(process.cwd(), ".agents/skills"),
  resolve(process.cwd(), "../.agents/skills"),
  resolve(process.env.HOME || "", ".config/amp/skills"),
  resolve(process.env.HOME || "", ".config/agents/skills"),
].filter((dir, index, dirs) => dir && dirs.indexOf(dir) === index);

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

async function listSkillNames(): Promise<string[]> {
  const names = new Set<string>();

  for (const skillDir of skillDirectoryCandidates) {
    if (!(await directoryExists(skillDir))) {
      continue;
    }

    const entries = await readdir(skillDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillPath = join(skillDir, entry.name, SKILL_DOC_NAME);
      if (await directoryExists(skillPath)) {
        names.add(entry.name);
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

async function findSkillFilePath(skillName: string): Promise<string | null> {
  for (const skillDir of skillDirectoryCandidates) {
    const skillPath = join(skillDir, skillName, SKILL_DOC_NAME);
    if (await directoryExists(skillPath)) {
      return skillPath;
    }
  }
  return null;
}

const skillsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/skills",
    {
      preHandler: [authenticate, ensureRole("admin")],
      schema: {
        tags: ["Skills"],
        summary: "List available skills",
        description: "Returns all detected skill names from configured skill directories. Tenant admin role required.",
        response: {
          200: {
            type: "object",
            properties: {
              skills: {
                type: "array",
                items: { type: "string" },
              },
            },
            example: {
              skills: ["frontend-design", "prd", "ralph"],
            },
          },
          401: {
            description: "Authentication required",
            ...error401Schema,
          },
          403: {
            description: "Tenant admin role required",
            ...error403Schema,
          },
        },
      },
    },
    async () => {
      return {
        skills: await listSkillNames(),
      };
    }
  );

  fastify.get<{ Params: SkillParams }>(
    "/skill/:skillname",
    {
      preHandler: [authenticate, ensureRole("admin")],
      schema: {
        tags: ["Skills"],
        summary: "Get skill spec",
        description: "Returns the SKILL.md content for a specific skill name. Tenant admin role required.",
        params: {
          type: "object",
          required: ["skillname"],
          properties: {
            skillname: { type: "string", minLength: 1, example: "frontend-design" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              skill: { type: "string", example: "frontend-design" },
              content: { type: "string", example: "---\nname: frontend-design\n---\n..." },
            },
          },
          404: {
            description: "Skill not found",
            ...error404Schema,
          },
          401: {
            description: "Authentication required",
            ...error401Schema,
          },
          403: {
            description: "Tenant admin role required",
            ...error403Schema,
          },
        },
      },
    },
    async (request, reply) => {
      const { skillname } = request.params;

      if (skillname.includes("/") || skillname.includes("\\") || skillname.includes("..")) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `Skill '${skillname}' not found`,
        });
      }

      const skillPath = await findSkillFilePath(skillname);
      if (!skillPath) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `Skill '${skillname}' not found`,
        });
      }

      const content = await readFile(skillPath, "utf-8");
      return {
        skill: skillname,
        content,
      };
    }
  );
};

export default skillsRoutes;
