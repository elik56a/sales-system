import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { db } from "./connection";
import { logger } from "@/monitoring/logger";

const createExtensions = async () => {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
};

const seedDatabase = async () => {
  try {
    logger.info("Seeding database...");

    await createExtensions();

    // This will create the tables in the database
    await migrate(db, { migrationsFolder: "./drizzle" });

    logger.info("Database seeded successfully ");
    process.exit(0);
  } catch (error) {
    logger.error("Database seeding failed:", error);
    process.exit(1);
  }
};

if (require.main === module) {
  seedDatabase();
}

export { seedDatabase };
