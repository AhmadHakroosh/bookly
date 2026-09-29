import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createEmailVerificationToken } from "better-auth/api";
import { config } from "dotenv";
import { platformUrl, tenantUrl } from "../../playwright.cloud.config";
import { DEMO, upcomingWeekday } from "../e2e/helpers";

// AUTH_SECRET signs the verification token the sign-up test mints for itself (the server reads the same files).
config({ path: ["../../.env.local", "../../.env"] });

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Fetch from inside the browser so the mapped hosts resolve (Node has no such mapping). */
async function api(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        method: init?.method ?? "GET",
        headers: init?.body ? { "content-type": "application/json" } : undefined,
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
      const text = await res.text();
      return { status: res.status, type: res.headers.get("content-type") ?? "", text };
    },
    { path, init },
  );
}

test.describe("marketing site", () => {
  const pages: [string, string][] = [
    ["/", "The meeting is booked"],
    ["/pricing", "Start free"],
    ["/about", "About Bookly"],
    ["/contact", "Contact"],
    ["/security", "Security"],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of service"],
    ["/dpa", "Data processing agreement"],
    ["/changelog", "Changelog"],
  ];
  for (const [path, heading] of pages)
    test(`${path} renders`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    });

  test("pricing switches between yearly and monthly", async ({ page }) => {
    await page.goto("/pricing");
    // Yearly is the default: Pro shows the monthly equivalent and the yearly charge.
    await expect(page.getByText("billed $240 a year")).toBeVisible();
    await page.getByRole("radio", { name: "Monthly" }).click();
    await expect(page.getByText("billed $240 a year")).toHaveCount(0);
    await expect(page.getByText("billed monthly").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Start with Pro" })).toHaveAttribute(
      "href",
      /plan=pro&interval=month/,
    );
    await page.getByRole("radio", { name: /Yearly/ }).click();
    await expect(page.getByRole("button", { name: "Start with Pro" })).toHaveAttribute(
      "href",
      /interval=year/,
    );
  });

  test("social metadata, robots, sitemap, social image and real 404s", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Bookly/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/$/);
    const robots = await api(page, "/robots.txt");
    expect(robots.text).toContain("Sitemap:");
    expect(robots.text).toContain("Disallow: /console");
    const sitemap = await api(page, "/sitemap.xml");
    expect(sitemap.text).toContain("/pricing");
    const og = await api(page, "/og");
    expect(og.status).toBe(200);
    expect(og.type).toContain("image/png");
    const missing = await page.goto("/definitely-not-a-page");
    expect(missing?.status()).toBe(404);
    const tenant = await page.goto(tenantUrl("no-such-workspace") + "/");
    expect(tenant?.status()).toBe(404);
  });

  test("llms.txt and file-like paths", async ({ page }) => {
    await page.goto("/");
    const llms = await api(page, "/llms.txt");
    expect(llms.status).toBe(200);
    expect(llms.type).toContain("text/markdown");
    expect(llms.text).toMatch(/^# Bookly\n/);
    expect(llms.text).toContain("/docs/");
    // A path that looks like a file but is none is a real 404, not the not-found page as a 200.
    const fake = await api(page, "/ai-catalog.json");
    expect(fake.status).toBe(404);
    const embed = await api(page, "/embed.js");
    expect(embed.status).toBe(200);
    expect(embed.type).toContain("javascript");
    // Workspace hosts have no llms.txt of their own.
    await page.goto(tenantUrl(DEMO.username) + "/");
    const tenantLlms = await api(page, "/llms.txt");
    expect(tenantLlms.status).toBe(404);
  });

  test("telemetry receiver validates pings", async ({ page }) => {
    await page.goto("/");
    const bad = await api(page, "/api/telemetry", { method: "POST", body: { installId: "x" } });
    expect(bad.status).toBe(400);
    const ok = await api(page, "/api/telemetry", {
      method: "POST",
      body: {
        installId: "6f0a4b2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
        version: "0.1.0",
        tenancy: "single",
        nodeVersion: "v24.0.0",
      },
    });
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.text)).toMatchObject({ latest: expect.any(String) });
  });

  test("sign-up API refuses accounts without consent", async ({ page }) => {
    await page.goto("/signup");
    const res = await api(page, "/api/auth/sign-up/email", {
      method: "POST",
      body: {
        name: "No Consent",
        email: `noconsent-${Date.now()}@example.com`,
        password: "password-12345",
      },
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain("terms");
  });

  for (const path of ["/", "/pricing", "/signup"])
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      // Scroll-reveal keeps off-screen sections at opacity 0, which axe reads as invisible text
      // on white; reduced motion disables the effect (as it does for real users who ask for it).
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
});

test.describe("sign-up and tenants", () => {
  test("a new account with consent gets its own workspace on a subdomain", async ({ page }) => {
    const slug = `ci-${Date.now().toString(36)}`;
    await page.goto("/signup");
    await page.locator('input[name="name"]').fill("CI Owner");
    await page.locator('input[name="email"]').fill(`${slug}@example.com`);
    await page.locator('input[name="password"]').fill("ci-owner-password-1");
    for (const box of await page.getByRole("checkbox").all()) await box.check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    // The address must be confirmed before the workspace step: open the link the email carries.
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    const token = await createEmailVerificationToken(
      process.env.AUTH_SECRET!,
      `${slug}@example.com`,
    );
    await page.goto(
      `${platformUrl}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent("/signup")}`,
    );
    await page.locator('input[name="name"]').fill("CI Workspace");
    // Reserved and look-alike addresses are refused inline and keep the button disabled.
    const create = page.getByRole("button", { name: "Create workspace" });
    await page.locator('input[name="slug"]').fill("staging");
    await expect(page.getByRole("alert").filter({ hasText: "reserved" })).toBeVisible();
    await expect(create).toBeDisabled();
    await page.locator('input[name="slug"]').fill("b00kly-login");
    await expect(page.getByRole("alert").filter({ hasText: "imitates" })).toBeVisible();
    await page.locator('input[name="slug"]').fill(slug);
    await expect(page.getByText("Available")).toBeVisible();
    await create.click();
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(tenantUrl(slug))}/admin`));
    await expect(page.getByRole("heading", { name: "Your booking page" })).toBeVisible();
  });

  test("a guest books on the demo tenant", async ({ page }) => {
    const date = upcomingWeekday();
    await page.goto(
      `${tenantUrl(DEMO.username)}/${DEMO.username}/intro-call?tz=UTC&month=${date.slice(0, 7)}&date=${date}`,
    );
    // The demo tenant is on Free: Bookly stays visible on its pages.
    await expect(page.getByRole("link", { name: /Powered by Bookly/ })).toBeVisible();
    const slot = page.locator('a[href*="slot="]').first();
    await expect(slot).toBeVisible();
    await slot.click();
    // The demo event offers two ways to meet: pick the phone call.
    await page.getByRole("radio", { name: /We call you/ }).check();
    await page.getByLabel("Phone number", { exact: true }).fill("201 555 0123");
    await page.getByLabel("Name", { exact: true }).fill("Cloud Guest");
    await page.getByLabel("Email", { exact: true }).fill(`cloud-guest-${Date.now()}@example.com`);
    for (const q of await page.locator('[name^="q_"]').all()) {
      const tag = await q.evaluate((el) => el.tagName.toLowerCase());
      if (tag === "select") await q.selectOption({ index: 1 });
      else if ((await q.getAttribute("type")) === "hidden") continue;
      else await q.fill("E2E answer");
    }
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
    // The number travels with the booking, formatted, in the details.
    await expect(page.getByText("Phone call to +1 201 555 0123")).toBeVisible();
  });

  test("host signs in on the tenant, sees the switcher, chooser and console", async ({ page }) => {
    await page.goto(`${tenantUrl(DEMO.username)}/login?next=%2Fadmin`);
    await page.locator('input[name="email"]').fill(DEMO.email);
    await page.locator('input[name="password"]').fill(DEMO.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Demo Workspace/ })).toBeVisible();
    // Cookies span the root domain, so the platform host sees the same session.
    await page.goto(`${platformUrl}/workspaces`);
    await expect(page.getByRole("heading", { name: "Your workspaces" })).toBeVisible();
    await expect(page.getByText("Demo Workspace")).toBeVisible();
    await page.goto(`${platformUrl}/console`);
    await expect(page.getByRole("heading", { name: "Operator console" })).toBeVisible();
    await page.goto(`${platformUrl}/console/payments`);
    await expect(page.getByRole("heading", { name: "Platform fee" })).toBeVisible();
    await page.goto(`${platformUrl}/console/health`);
    await expect(page.getByText("Rate limiting")).toBeVisible();
    await expect(page.getByText("Background jobs")).toBeVisible();
    await page.goto(`${platformUrl}/console/installs`);
    await expect(page.getByRole("heading", { name: "Self-hosted installs" })).toBeVisible();
  });
});

test.describe("team invitations", () => {
  test("an invitee creates an account from the invitation and lands in the workspace", async ({
    page,
    browser,
  }) => {
    // The owner is also the platform operator: comp the demo workspace onto Team so it may
    // have more than one member.
    await page.goto(`${tenantUrl(DEMO.username)}/login?next=%2Fadmin`);
    await page.locator('input[name="email"]').fill(DEMO.email);
    await page.locator('input[name="password"]').fill(DEMO.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });
    await page.goto(`${platformUrl}/console`);
    await page.getByRole("link", { name: "Demo Workspace" }).first().click();
    await expect(page).toHaveURL(/\/console\/[0-9a-f-]+$/);
    await page.getByRole("combobox", { name: "Plan" }).click();
    await page.getByRole("option", { name: "Team" }).click();
    await page.getByRole("button", { name: "Set plan" }).click();
    await expect(page.getByRole("button", { name: "Release to Stripe" })).toBeVisible();

    const email = `invitee-${Date.now().toString(36)}@example.com`;
    await page.goto(`${tenantUrl(DEMO.username)}/admin/team`);
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: /Invite/ }).click();
    await expect(page.getByText(email)).toBeVisible();
    const orgs = JSON.parse((await api(page, "/api/auth/organization/list")).text) as {
      id: string;
    }[];
    const invites = JSON.parse(
      (await api(page, `/api/auth/organization/list-invitations?organizationId=${orgs[0]!.id}`))
        .text,
    ) as { id: string; email: string; status: string }[];
    const invite = invites.find((i) => i.email === email && i.status === "pending");
    expect(invite).toBeTruthy();

    // A fresh browser: the invitee has no account and no session yet.
    const invitee = await (await browser.newContext()).newPage();
    await invitee.goto(`${platformUrl}/accept-invitation/${invite!.id}`);
    await expect(invitee.getByRole("heading", { name: /Join Demo Workspace/ })).toBeVisible();
    await invitee.locator('input[name="name"]').fill("Invited Member");
    await invitee.locator('input[name="password"]').fill("invitee-password-1");
    for (const box of await invitee.getByRole("checkbox").all()) await box.check();
    await invitee.getByRole("button", { name: "Create account and join" }).click();
    // Accepted on the platform host, the invitee lands on the workspace's own admin.
    await expect(invitee).toHaveURL(
      new RegExp(`^${escapeRegExp(tenantUrl(DEMO.username))}/admin/profile`),
    );
    await expect(invitee.getByRole("heading", { name: "Your booking page" })).toBeVisible();
    await invitee.context().close();

    // Leave the demo workspace as it was found: back on Free, under Stripe's control.
    await page.goto(`${platformUrl}/console`);
    await page.getByRole("link", { name: "Demo Workspace" }).first().click();
    await page.getByRole("button", { name: "Release to Stripe" }).click();
    await expect(page.getByRole("button", { name: "Release to Stripe" })).toHaveCount(0);
  });
});
