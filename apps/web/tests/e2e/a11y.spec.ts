import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DEMO, STORAGE, settled } from "./helpers";

const scan = async (page: import("@playwright/test").Page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze();

test("public pages have no axe violations", async ({ page }) => {
  for (const path of [`/${DEMO.username}`, `/${DEMO.username}/intro-call?tz=UTC`, "/login"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await scan(page);
    expect(r.violations, `${path}: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
  }
});

// Every page the shell wraps (the sidebar, top bar and page header are on all). Light only: the
// app ignores a dark system preference, so there is one theme to scan.
test("admin pages and the shell have no axe violations", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
  for (const path of [
    "/admin",
    "/admin/bookings?mode=list",
    "/admin/bookings?mode=calendar&cal=week",
    "/admin/bookings?mode=calendar&cal=month",
    "/admin/contacts",
    "/admin/tasks?view=all&layout=board",
    "/admin/tasks?view=all&layout=list",
    "/admin/notifications",
    "/admin/files?view=my",
    "/admin/files?view=contacts",
    "/admin/messages",
    "/admin/messages?box=team",
    "/admin/event-types",
    "/admin/availability",
    "/admin/routing",
    "/admin/calendars",
    "/admin/conferencing",
    "/admin/profile",
    "/admin/account",
    "/admin/settings",
    "/admin/settings/license",
    "/admin/team",
    "/admin/domains",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await settled(page);
    const r = await scan(page);
    expect(r.violations, `${path}: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
  }
  // The shell's own popups: search-or-jump with results, and the Help menu.
  await page.goto("/admin");
  // The shortcut is listened for once the page has hydrated.
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("se");
  await expect(page.getByRole("option").first()).toBeVisible();
  await settled(page);
  let r = await scan(page);
  expect(r.violations, `⌘K: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Help" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await settled(page);
  r = await scan(page);
  expect(r.violations, `Help: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
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
