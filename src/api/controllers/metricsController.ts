import { Request, Response } from "express";
import { pool } from "@/database/connection";
import { createContextLogger } from "@/monitoring/logger";

interface SystemMetrics {
  timestamp: string;
  database: {
    totalConnections: number;
    idleConnections: number;
    waitingCount: number;
  };
  memory: {
    used: number;
    total: number;
    usage: string;
  };
  uptime: number;
  process: {
    pid: number;
    version: string;
  };
}

export const getMetrics = async (req: Request, res: Response) => {
  const contextLogger = createContextLogger(req.correlationId);

  try {
    const memUsage = process.memoryUsage();

    const metrics: SystemMetrics = {
      timestamp: new Date().toISOString(),
      database: {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        usage: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`,
      },
      uptime: Math.round(process.uptime()),
      process: {
        pid: process.pid,
        version: process.version,
      },
    };

    contextLogger.info("Metrics requested", {
      dbConnections: metrics.database.totalConnections,
      memoryUsage: metrics.memory.usage,
    });

    res.json(metrics);
  } catch (error) {
    contextLogger.error("Failed to get metrics", {
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to retrieve system metrics",
      correlationId: req.correlationId,
    });
  }
};
