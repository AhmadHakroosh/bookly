import { expect, test } from "@playwright/test";
import { eq, schema } from "@bookly/db";
import { STORAGE } from "./helpers";
import { testDb } from "./db";

/*
 * The admin shell (v1.0 Phase 3.1): the sidebar grouped by job, the breadcrumb, ⌘K
 * search-or-jump, the Help menu, Hiring behind its flag, and the phone layout.
 */

test.use({ storageState: STORAGE });

const run = Date.now().toString(36).slice(-5);
const CONTACT = { name: `Shell Contact ${run}`, email: `shell-${run}@example.com` };

test.beforeAll(async () => {
  const db = testDb();
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.slug, "demo") });
  await db.insert(schema.contacts).values({ workspaceId: ws!.id, ...CONTACT });
});

test.afterAll(async () => {
  const db = testDb();
  await db.delete(schema.contacts).where(eq(schema.contacts.email, CONTACT.email));
  await flags("off");
});

/** Hiring builds on pipelines (ADR 0003): the flag only counts where pipelines is on too. */
const flags = async (state: "on" | "off") => {
  const db = testDb();
  for (const key of ["pipelines", "hiring"] as const)
    await db
      .insert(schema.featureFlags)
      .values({ key, description: key, state })
      .onConflictDoUpdate({ target: schema.featureFlags.key, set: { state } });
};

test("the sidebar groups pages by job and the breadcrumb follows", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin" });
  for (const group of ["Work", "Scheduling", "Workspace"])
    await expect(nav.getByText(group, { exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByText("Work")).toBeVisible();
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText("Home");

  await nav.getByRole("link", { name: "Settings" }).click();
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: "Branding" })
    .click();
  await expect(page).toHaveURL(/\/admin\/settings\/branding/);
  await expect(crumbs.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText("Branding");
});

test("⌘K jumps to a page and finds a contact", async ({ page }) => {
  await page.goto("/admin");
  // The shortcut is listened for once the page has hydrated.
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("ControlOrMeta+k");
  const menu = page.getByRole("dialog", { name: "Search or jump" });
  await expect(menu).toBeVisible();
  await page.keyboard.type("event types");
  await expect(menu.getByRole("option", { name: /Event types/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/event-types$/);
  await expect(page.getByRole("heading", { name: "Event types", level: 1 })).toBeVisible();
  await expect(menu).toBeHidden();
  await page.waitForLoadState("networkidle");

  // The field in the top bar opens the same menu; contacts come from the server as you type.
  await page.getByRole("button", { name: /Search or jump to/ }).click();
  await page.keyboard.type(CONTACT.name);
  await menu.getByRole("option", { name: new RegExp(CONTACT.name) }).click();
  await expect(page).toHaveURL(/\/admin\/contacts\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: CONTACT.name })).toBeVisible();
});

test("Help lists the documentation and the keyboard shortcuts", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Help" }).click();
  await expect(page.getByRole("menuitem", { name: /Documentation/ })).toHaveAttribute(
    "href",
    "/docs",
  );
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog.getByText("Search or jump to a page")).toBeVisible();
});

test("Hiring shows in the sidebar only where its flag is on", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByText("Hiring", { exact: true })).toHaveCount(0);
  await page.goto("/admin/hiring");
  await expect(page).toHaveURL(/\/admin$/);

  await flags("on");
  await page.goto("/admin");
  await expect(nav.getByText("Hiring", { exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Hiring", level: 1 })).toBeVisible();
  await expect(page.getByText("No opportunities yet")).toBeVisible();
  await flags("off");
});

test("on a phone the sidebar opens from the menu button and closes on a link", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin");
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("link", { name: "Bookings" }).click();
  await expect(page).toHaveURL(/\/admin\/bookings/);
  await expect(sheet).toBeHidden();
  // Search is a button on a phone; it opens the same menu.
  await page.getByRole("button", { name: "Search or jump to" }).click();
  await expect(page.getByRole("dialog", { name: "Search or jump" })).toBeVisible();
});
