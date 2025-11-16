import express, { Express } from "express";
import { correlationIdMiddleware } from "@/api/middleware/correlationId";
import { rateLimiter } from "@/api/middleware/rateLimiter";
import { queueMiddleware } from "@/api/middleware/requestQueue";
import { errorHandler, notFoundHandler } from "@/api/middleware/errorHandler";
import { healthCheck } from "@/monitoring/healthCheck";
import { apiRoutes } from "@/api/routes";
import { logger } from "@/monitoring/logger";
import { authenticateToken } from "./api/middleware/auth";
import { outboxPublisher } from "./workers/outboxPublisher";
import { statusConsumer } from "./workers/statusConsumer";
import { deliveryService } from "./services/deliveryService";
import type http from "http";

export const createApp = (): Express => {
  const app = express();

  // Trust proxy for rate limiting
  app.set("trust proxy", 1);

  // Basic middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Custom middleware
  app.use(correlationIdMiddleware);
  // app.use(queueMiddleware);
  app.use(rateLimiter);

  // Health checks (no auth required)
  app.get("/health", healthCheck);

  // API routes
  app.use("/api", authenticateToken, apiRoutes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export const startBackgroundWorkers = () => {
  logger.info("Starting background workers...");
  outboxPublisher.start();
  statusConsumer.start();
  deliveryService.start();
};

export const stopBackgroundWorkers = () => {
  logger.info("Stopping background workers...");
  outboxPublisher.stop();
  statusConsumer.stop();
  deliveryService.stop();
};

export const setupGracefulShutdown = (server: http.Server) => {
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    stopBackgroundWorkers();

    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error(
        "Could not close connections in time, forcefully shutting down"
      );
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};
