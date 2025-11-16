import winston from "winston";
import { config } from "@/config/env";

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

export const createContextLogger = (correlationId: string) => {
  return {
    info: (message: string, meta?: any) =>
      logger.info(message, { correlationId, ...meta }),
    error: (message: string, meta?: any) =>
      logger.error(message, { correlationId, ...meta }),
    warn: (message: string, meta?: any) =>
      logger.warn(message, { correlationId, ...meta }),
    debug: (message: string, meta?: any) =>
      logger.debug(message, { correlationId, ...meta }),
  };
};

export type ContextLogger = ReturnType<typeof createContextLogger>;
