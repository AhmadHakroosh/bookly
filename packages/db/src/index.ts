import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __booklyPool?: Pool; __booklyDb?: Database };

/**
 * Process-wide Drizzle client over node-postgres. Works for self-host (Docker
 * Postgres), Neon, Supabase, RDS — any Postgres 13+ reachable over TCP.
 */
/**
 * `sslmode=prefer|require|verify-ca` are aliases for `verify-full` in pg 8 and will weaken in
 * pg 9; spell out `verify-full` so behaviour stays the same and the driver stops warning.
 */
export function normalizeConnectionString(url: string): string {
  return url.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}

export function createDb(connectionString: string): Database {
  if (globalForDb.__booklyDb) return globalForDb.__booklyDb;
  const pool = new Pool({ connectionString: normalizeConnectionString(connectionString), max: 10 });
  globalForDb.__booklyPool = pool;
  globalForDb.__booklyDb = drizzle(pool, { schema, casing: "snake_case" });
  return globalForDb.__booklyDb;
}

export function getDb(): Database {
  if (globalForDb.__booklyDb) return globalForDb.__booklyDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return createDb(url);
}

export async function closeDb() {
  await globalForDb.__booklyPool?.end();
  globalForDb.__booklyPool = undefined;
  globalForDb.__booklyDb = undefined;
}

export { schema };
export * from "drizzle-orm";
