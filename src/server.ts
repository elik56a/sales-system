import {
  createApp,
  setupGracefulShutdown,
  startBackgroundWorkers,
} from "./app";
import { config } from "@/config/env";
import { logger } from "@/monitoring/logger";
import { checkDatabaseConnection } from "@/monitoring/healthCheck";

const startServer = async () => {
  try {
    await checkDatabaseConnection();

    const app = createApp();

    const server = app.listen(config.port, () => {
      logger.info(`🚀 Sales System started on port ${config.port}`, {
        environment: process.env.NODE_ENV || "development",
        port: config.port,
      });

      // Start background workers after server is ready
      startBackgroundWorkers();
    });

    setupGracefulShutdown(server);

    return server;
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}
