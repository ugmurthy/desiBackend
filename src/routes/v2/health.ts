import type { FastifyPluginAsync } from "fastify";
import { getAdminDatabase } from "../../db/admin-schema";

const startTime = Date.now();

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async () => {
    return {
      status: "ok",
      version: "1.0.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };
  });

  fastify.get("/health/ready", async () => {
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
