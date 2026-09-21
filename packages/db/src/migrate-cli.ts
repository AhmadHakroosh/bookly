/**
 * Standalone migrator bundled with esbuild for the Docker image (no TypeScript toolchain there).
 * Same semantics as `pnpm db:migrate`: drizzle's migrator over the committed `drizzle/` folder.
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { normalizeConnectionString } from "./index";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: normalizeConnectionString(url), max: 1 });
migrate(drizzle(pool), {
  migrationsFolder: process.env.MIGRATIONS_DIR ?? path.resolve(__dirname, "drizzle"),
})
  .then(async () => {
    console.log("Migrations applied");
    await pool.end();
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
