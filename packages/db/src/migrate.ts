import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { closeDb, getDb } from "./index";

config({ path: ["../../.env.local", "../../.env", ".env"] });

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

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
