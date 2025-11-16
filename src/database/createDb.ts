import { Client } from "pg";
import { logger } from "@/monitoring/logger";
import { config } from "@/config/env";

const createDatabase = async (): Promise<void> => {
  const url = new URL(config.database.url);
  const dbName = url.pathname.slice(1); // Remove leading slash

  const client = new Client({
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    user: url.username,
    password: url.password,
    database: "postgres", // Connect to default database first
  });

  try {
    await client.connect();

    const { rows } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (rows.length === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      logger.info(`✅ Database "${dbName}" created`);
    } else {
      logger.info(`✅ Database "${dbName}" already exists`);
    }
  } finally {
    await client.end();
  }
};

if (require.main === module) {
  createDatabase().catch((error) => {
    logger.error("❌ Failed to create database", { error });
    process.exit(1);
  });
}

export { createDatabase };
