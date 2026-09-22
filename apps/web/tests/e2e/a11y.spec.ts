import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DEMO, STORAGE } from "./helpers";

const scan = async (page: import("@playwright/test").Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

test("public pages have no axe violations", async ({ page }) => {
  for (const path of [`/${DEMO.username}`, `/${DEMO.username}/intro-call?tz=UTC`, "/login"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await scan(page);
    expect(r.violations, `${path}: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
  }
});

test("admin inbox and bookings have no axe violations", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
  for (const path of ["/admin", "/admin/bookings", "/admin/contacts"]) {
    await page.goto(path);
    const r = await scan(page);
    expect(r.violations, `${path}: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
  }
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const admin = await request.get("/admin", { maxRedirects: 0 });
  expect(admin.headers()["x-frame-options"]).toBe("DENY");
});
