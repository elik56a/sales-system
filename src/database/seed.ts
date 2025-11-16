import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { db } from "./connection";

const createExtensions = async () => {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  console.log("✅ Extensions created");
};

const seedDatabase = async () => {
  try {
    console.log("🌱 Seeding database with Drizzle...");

    await createExtensions();

    // This will create the tables in the database
    await migrate(db, { migrationsFolder: "./drizzle" });

    console.log("🎉 Database seeded successfully with Drizzle");
    process.exit(0);
  } catch (error) {
    console.error("❌ Database seeding failed:", error);
    process.exit(1);
  }
};

if (require.main === module) {
  seedDatabase();
}

export { seedDatabase };
