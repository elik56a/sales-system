import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  database: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:password@localhost:5432/sales_db",
    poolSize: parseInt(process.env.DB_POOL_SIZE || "50"),
    poolMinSize: parseInt(process.env.DB_POOL_MIN_SIZE || "10"),
  },
  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key-here",
  },
  inventory: {
    serviceUrl: process.env.INVENTORY_SERVICE_URL || "http://localhost:3001",
  },
  circuitBreaker: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || "5000"), // 5 seconds
    failureThreshold: parseInt(
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || "5" // 5 failures before opening
    ),
    resetTimeout: parseInt(
      process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || "30000" // 30 seconds recovery time
    ),
  },
  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || "5"),
    baseDelay: parseInt(process.env.RETRY_BASE_DELAY || "100"),
    maxDelay: parseInt(process.env.RETRY_MAX_DELAY || "1600"),
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
  healthCheck: {
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || "5000"),
  },
  mockQueue: {
    enabled: process.env.MOCK_QUEUE_ENABLED === "true",
  },
};
