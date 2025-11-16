import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";

export type DatabaseTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof import("@/database/schema"),
  any
>;
