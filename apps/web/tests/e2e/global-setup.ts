import { execSync } from "node:child_process";

/** Migrates the test database and seeds the demo workspace (idempotent). */
export default function globalSetup() {
  execSync("pnpm --filter @bookly/db migrate", { stdio: "inherit", cwd: "../.." });
  execSync("pnpm --filter @bookly/web demo", { stdio: "inherit", cwd: "../.." });
}
