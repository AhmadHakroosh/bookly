import { defineConfig, devices } from "@playwright/test";

/**
 * Cloud (multi-tenant) end-to-end tests: the marketing site, sign-up, a tenant booking, the
 * workspace chooser and the operator console. Hosts under `bookly.test` are mapped to
 * 127.0.0.1 inside Chromium (no DNS or /etc/hosts needed), and cookies are shared across
 * subdomains because the root has a dot. Build first with the same APP_URL / ROOT_DOMAIN.
 */
export const CLOUD = {
  port: 3011,
  root: process.env.CLOUD_ROOT ?? "bookly.test",
  admin: "demo@example.com",
};
export const platformUrl = `http://platform.${CLOUD.root}:${CLOUD.port}`;
export const tenantUrl = (slug: string) => `http://${slug}.${CLOUD.root}:${CLOUD.port}`;

export default defineConfig({
  testDir: "./tests/cloud",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: platformUrl,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
    launchOptions: { args: [`--host-resolver-rules=MAP *.${CLOUD.root} 127.0.0.1`] },
  },
  webServer: {
    command: `pnpm e2e:prepare && pnpm exec next start -p ${CLOUD.port}`,
    // Node cannot resolve bookly.test; the health route answers on any host.
    url: `http://localhost:${CLOUD.port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      TENANCY: "multi",
      APP_URL: platformUrl,
      ROOT_DOMAIN: `${CLOUD.root}:${CLOUD.port}`,
      PLATFORM_ADMIN_EMAILS: CLOUD.admin,
      EMAIL_PROVIDER: "console",
      JOBS_WORKER: "false",
      TELEMETRY: "off",
    },
  },
});
