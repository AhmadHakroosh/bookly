import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { closeDb, getDb } from "./index";
import { assertMigrationTargetAllowed } from "./migrate-guard";

config({ path: ["../../.env.local", "../../.env", ".env"] });

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, "../drizzle");

// Never staging, preview or production from a laptop (see migrate-guard.ts).
try {
  assertMigrationTargetAllowed(path.resolve(here, "../../.."));
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

migrate(getDb(), { migrationsFolder })
  .then(async () => {
    console.log("Migrations applied");
    await closeDb();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
