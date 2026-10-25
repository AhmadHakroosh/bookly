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

test("the sidebar is the concept's, and the breadcrumb starts at Workspace", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin" });
  // app ui.png: no group headings, Settings and Team pinned to the bottom.
  for (const heading of ["Work", "Scheduling", "Workspace"])
    await expect(nav.getByText(heading, { exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link")).toHaveText([
    "Home",
    "Bookings",
    "Contacts",
    /Messages/,
    "Tasks",
    "Files",
    "Booking page",
    "Event types",
    "Availability",
    "Settings",
    "Team",
  ]);
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Workspace" })).toBeVisible();
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText("Home");
  // The account card at the foot of the sidebar opens the same menu as the avatar.
  await page.getByRole("complementary").getByRole("button", { name: /Demo/ }).click();
  await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
  await page.keyboard.press("Escape");

  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Workspace settings", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Brand & communications" }).click();
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

test("Create on Home opens the new task form", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("menuitem", { name: "Task" }).click();
  await expect(page).toHaveURL(/\/admin\/tasks\?new=1/);
  const form = page.getByRole("dialog");
  await expect(form.getByRole("heading", { name: /task/i })).toBeVisible();
  // Closing forgets ?new=1, so a reload does not open the form again.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/admin\/tasks$/);
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

test("a workspace in the hiring beta switches between Clients and Hiring", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("group", { name: "Solution" })).toHaveCount(0);
  await page.goto("/admin/hiring");
  await expect(page).toHaveURL(/\/admin$/);

  await flags("on");
  await page.goto("/admin");
  const solution = nav.getByRole("group", { name: "Solution" });
  await expect(solution.getByRole("link", { name: "Clients" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await solution.getByRole("link", { name: "Hiring" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  // Hiring's own sidebar and breadcrumb (hiring.png).
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Opportunities" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Bookings" })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Hiring" }),
  ).toBeVisible();
  await flags("off");
});

test("the account sits in the sidebar on a large screen and in the top bar on a phone", async ({
  page,
}) => {
  // visual-alignment §2.3: no header avatar from lg; a 44 px card at the foot of the sidebar.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/admin");
  const header = page.locator("header").first();
  await expect(header.getByRole("button", { name: /^Account:/ })).toHaveCount(0);
  const card = page.getByRole("complementary").locator('[data-slot="avatar"]').last();
  await expect(card).toHaveAttribute("data-size", "lg");
  expect((await card.boundingBox())?.width).toBe(44);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(header.getByRole("button", { name: /^Account:/ })).toBeVisible();
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
