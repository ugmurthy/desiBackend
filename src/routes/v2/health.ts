import type { FastifyPluginAsync } from "fastify";
import { getAdminDatabase } from "../../db/admin-schema";

const startTime = Date.now();

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", {
    schema: {
      tags: ["Health"],
      summary: "Health check",
      description: "Returns the current health status, version, and uptime of the service",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            version: { type: "string" },
            uptime: { type: "number" },
          },
          example: {
            status: "ok",
            version: "1.0.0",
            uptime: 3600,
          },
        },
      },
    },
  }, async () => {
    return {
      status: "ok",
      version: "1.0.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };
  });

  fastify.get("/health/ready", {
    schema: {
      tags: ["Health"],
      summary: "Readiness check",
      description: "Checks if the service is ready to accept requests by verifying database connectivity",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            checks: {
              type: "object",
              properties: {
                database: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          example: {
            status: "ready",
            checks: {
              database: {
                status: "connected",
              },
            },
          },
        },
      },
    },
  }, async () => {
    let dbStatus: "connected" | "disconnected" = "disconnected";
    let dbError: string | undefined;

    try {
      const db = getAdminDatabase();
      const result = db.query("SELECT 1 as check_value").get() as { check_value: number } | null;
      if (result && result.check_value === 1) {
        dbStatus = "connected";
      }
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Unknown database error";
    }

    const ready = dbStatus === "connected";

    return {
      status: ready ? "ready" : "not_ready",
      checks: {
        database: {
          status: dbStatus,
          ...(dbError && { error: dbError }),
        },
      },
    };
  });
};

export default healthRoutes;
