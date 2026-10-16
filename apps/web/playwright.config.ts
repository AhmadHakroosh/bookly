import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build in single-tenant mode. The server needs a
 * Postgres (DATABASE_URL) that is migrated and seeded with the demo workspace before the server
 * starts (Playwright launches `webServer` before `globalSetup`, so the prep lives in the command).
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
    command: `pnpm e2e:prepare && pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      TENANCY: "single",
      APP_URL: `http://localhost:${port}`,
      EMAIL_PROVIDER: "console",
      JOBS_WORKER: "false",
      // Guest replies: tests sign webhook calls with this secret and stand in for Resend's API.
      INBOUND_EMAIL_DOMAIN: "reply.bookly.test",
      RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from("e2e-webhook-secret-0123456789").toString("base64")}`,
      RESEND_API_KEY: "re_e2e",
      RESEND_API_URL: "http://localhost:3999",
    },
  },
});
