import { Request, Response } from "express";
import { pool } from "@/database/connection";
import { logger } from "./logger";

interface HealthStatus {
  status: "healthy" | "unhealthy";
  timestamp: string;
  services: {
    database: "up" | "down";
    api: "up" | "down";
  };
  uptime: number;
}

// Database connection check (for startup)
export const checkDatabaseConnection = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info("✅ Database connection verified");
  } catch (error: any | Error) {
    if (error?.code === "ECONNREFUSED") {
      logger.error(
        "❌ Database connection failed. Run `pnpm run db:start` first.",
        { error }
      );
    }
    if (error?.code === "3D000") {
      logger.error("❌ Database not found. Run `pnpm run db:setup` first.", {
        error,
      });
    }
    throw error;
  }
};

// Health check endpoint handler
export const healthCheck = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Check database
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    const healthStatus: HealthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "up",
        api: "up",
      },
      uptime: process.uptime(),
    };

    const responseTime = Date.now() - startTime;
    logger.info("Health check completed", { responseTime });

    res.status(200).json(healthStatus);
  } catch (error) {
    const healthStatus: HealthStatus = {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "down",
        api: "up",
      },
      uptime: process.uptime(),
    };

    logger.error("Health check failed", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(503).json(healthStatus);
  }
};
