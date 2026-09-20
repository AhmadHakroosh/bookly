import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ["../../.env.local", "../../.env", ".env"] });

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://bookly:bookly@localhost:5433/bookly",
  },
  casing: "snake_case",
  strict: true,
});
