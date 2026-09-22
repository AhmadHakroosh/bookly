import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build in single-tenant mode. The server needs a
 * Postgres (DATABASE_URL) that the global setup migrates and seeds with the demo workspace.
 * Locally: `pnpm --filter @bookly/web e2e` (builds if needed). CI runs the same.
 */
const port = 3010;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${port}`, trace: "on-first-retry" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: `pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      TENANCY: "single",
      APP_URL: `http://localhost:${port}`,
      EMAIL_PROVIDER: "console",
      JOBS_WORKER: "false",
    },
  },
});
