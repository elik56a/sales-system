import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "@/config/env";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.poolSize,
  min: config.database.poolMinSize,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });

export const closeDatabase = async () => {
  await pool.end();
};

export { pool };
