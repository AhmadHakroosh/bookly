import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { bookFirstSlot, DEMO, STORAGE } from "./helpers";

test.describe("admin", () => {
  test("wrong password is refused", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("demo@example.com");
    await page.locator('input[name="password"]').fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("home, bookings, brief, capture, contact", async ({ browser, page }) => {
    await bookFirstSlot(page, { name: "E2E Client", email: "e2e-client@example.com" });
    const admin = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await admin.goto("/admin/bookings");
    const row = admin.getByText("Intro call with E2E Client").first();
    await expect(row).toBeVisible();
    await row
      .locator("xpath=ancestor::li")
      .getByRole("link", { name: /Brief|Notes/ })
      .click();
    await expect(admin.getByRole("heading", { name: "Briefing" })).toBeVisible();
    await admin
      .getByPlaceholder(/Agreed to start/)
      .fill("Good call.\n- Send the proposal\n- Client shares docs");
    await admin.getByRole("button", { name: "Capture" }).click();
    // Each bullet became a task (the task list exposes a "Mark done" control per task).
    await expect(
      admin.getByRole("button", { name: "Mark done: Send the proposal" }).first(),
    ).toBeVisible();
    await expect(
      admin.getByRole("button", { name: "Mark done: Client shares docs" }).first(),
    ).toBeVisible();
    await admin.goto("/admin/contacts");
    await admin
      .getByRole("link", { name: /E2E Client/ })
      .first()
      .click();
    await expect(admin.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(admin.getByText(/Booked Intro call/).first()).toBeVisible();
  });

  test("core admin pages load", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
    for (const [path, heading] of [
      ["/admin/event-types", "Event types"],
      ["/admin/availability", "Availability"],
      ["/admin/contacts", "Contacts"],
      ["/admin/routing", "Routing forms"],
      ["/admin/settings", "Settings"],
      ["/admin/account", "Account"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });

  test("settings pages share the tab strip and the old API page redirects", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
    for (const [path, heading] of [
      ["/admin/settings/branding", "Branding"],
      ["/admin/settings/emails", "Emails"],
      ["/admin/settings/integrations", "Integrations"],
      ["/admin/settings/data", "Data"],
    ] as const) {
      await page.goto(path);
      // The layout heading streams in after the shell; give a cold production server room.
      await expect(
        page.getByRole("heading", { name: "Settings", level: 1 }),
        `${path} landed on ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 400)}`,
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: heading }),
      ).toHaveAttribute("aria-current", "page");
    }
    await page.goto("/admin/api");
    await expect(page).toHaveURL(/\/admin\/settings\/integrations$/);
  });

  test("a profile photo can be uploaded and is served from /files", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await page.goto("/admin/profile");
    // A small solid PNG; the server resizes whatever it gets, so a tiny image is enough.
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#e8965a" },
    })
      .png()
      .toBuffer();
    // The input is wired by React on hydration; the file chooser only opens once it is.
    await page.waitForLoadState("networkidle");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /(Upload|Replace) photo/ }).click(),
    ]);
    await chooser.setFiles({ name: "me.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("Photo updated")).toBeVisible({ timeout: 15_000 });
    const url = await page.locator('input[name="avatarUrl"]').inputValue();
    expect(url).toMatch(/^\/files\/[0-9a-f-]{36}$/);
    const res = await page.request.get(url);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\//);
    expect(res.headers()["cache-control"]).toContain("immutable");
    await page.goto("/admin/settings/data/activity");
    await expect(
      page
        .getByRole("list")
        .filter({ hasText: "File uploaded" })
        .getByText("File uploaded")
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Home shows the summary cards, each linking to its page", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await page.goto("/admin");
    const cards = page.getByRole("region", { name: "Summary" });
    await expect(cards).toBeVisible({ timeout: 15_000 });
    for (const [title, href] of [
      ["This week", "/admin/bookings"],
      ["Since your last visit", "/admin/bookings"],
      ["Needs attention", "/admin#"],
      ["Your tasks", "/admin#tasks"],
      ["Contacts", "/admin/contacts"],
      ["Payments this month", "/admin/"],
    ] as const) {
      // The card whose title is exactly this (other cards may mention the words in their text).
      const card = cards.getByRole("link").filter({ has: page.getByText(title, { exact: true }) });
      await expect(card).toBeVisible();
      const value = (await card.getAttribute("href")) ?? "";
      expect(value.startsWith(href), `${title} links to ${value}, expected ${href}…`).toBe(true);
    }
    // The page under the cards keeps its place.
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  test("the activity log records the sign-in and the Home label is Home", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await page.goto("/admin");
    await expect(
      page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Home" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Inbox" })).toHaveCount(0);
    await page.goto("/admin/settings/data/activity");
    await expect(page.getByRole("heading", { name: "Activity", level: 2 })).toBeVisible({
      timeout: 15_000,
    });
    // auth.setup.ts signed the demo user in, which is the first entry every install has.
    const rows = page.getByRole("list").filter({ hasText: "Session signed in" });
    await expect(rows.getByText("Session signed in").first()).toBeVisible();
    await expect(rows.getByText(DEMO.email).first()).toBeVisible();
  });
});

test.describe("pending state", () => {
  test.use({ storageState: STORAGE });

  test("a submit button shows progress while its action runs", async ({ page }) => {
    // Hold the server action long enough to observe the pending state.
    await page.route("**/admin", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.goto("/admin");
    const title = `Pending ${Date.now()}`;
    await page.getByPlaceholder("Add a task…").fill(title);
    const add = page.getByRole("button", { name: "Add" });
    await add.click();
    await expect(add).toBeDisabled();
    await expect(add).toHaveAttribute("aria-busy", "true");
    await expect(add.getByRole("status", { name: "Loading" })).toBeVisible();
    await page.unroute("**/admin");
    await expect(page.getByText(title)).toBeVisible();
    await expect(add).toBeEnabled();
  });
});
