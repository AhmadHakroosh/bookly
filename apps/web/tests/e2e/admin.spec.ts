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
    // Each row is the time, the person and the event type; it opens the booking beside the list.
    const row = admin.getByRole("link", { name: /E2E Client.*Intro call/ }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(admin.getByRole("heading", { name: "Briefing" })).toBeVisible();
    // Notes are on their own tab: the in-call notes, the action items and the capture.
    await admin.getByRole("tab", { name: "Notes" }).click();
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
      ["/admin/availability", "Availability & routing"],
      ["/admin/contacts", "Contacts"],
      ["/admin/routing", "Availability & routing"],
      ["/admin/calendars", "Calendars & conferencing"],
      ["/admin/settings", "Workspace settings"],
      ["/admin/account", "Account"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });

  test("settings pages share their half's tab strip and the old API page redirects", async ({
    browser,
  }) => {
    const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
    // mocks.png 08 and 06: Workspace settings, and Brand & communications (Domains among them).
    for (const [path, title, tab] of [
      ["/admin/settings/integrations", "Workspace settings", "Integrations"],
      ["/admin/settings/api", "Workspace settings", "API"],
      ["/admin/settings/data", "Workspace settings", "Privacy"],
      ["/admin/settings/branding", "Brand & communications", "Branding"],
      ["/admin/settings/emails", "Brand & communications", "Emails"],
      ["/admin/domains", "Brand & communications", "Domains"],
    ] as const) {
      await page.goto(path);
      // The layout heading streams in after the shell; give a cold production server room.
      await expect(
        page.getByRole("heading", { name: title, level: 1 }),
        `${path} landed on ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 400)}`,
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page
          .getByRole("navigation", { name: title.replace("&", "and") })
          .getByRole("link", { name: tab, exact: true }),
      ).toHaveAttribute("aria-current", "page");
    }
    await page.goto("/admin/api");
    await expect(page).toHaveURL(/\/admin\/settings\/api$/);
    await page.goto("/admin/conferencing");
    await expect(page).toHaveURL(/\/admin\/calendars/);
  });

  test("an account photo is cropped, uploaded and served from /files", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await page.goto("/admin/account");
    // Big enough for the 128 px minimum; the browser crops it to 512 × 512 before upload.
    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#e8965a" },
    })
      .png()
      .toBuffer();
    // The input is wired by React on hydration; the file chooser only opens once it is.
    await page.waitForLoadState("networkidle");
    const photo = page.locator("#photo");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      photo.getByRole("button", { name: "Upload photo" }).click(),
    ]);
    await chooser.setFiles({ name: "me.png", mimeType: "image/png", buffer: png });
    const dialog = page.getByRole("dialog", { name: "Crop your photo" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Photo updated")).toBeVisible({ timeout: 15_000 });
    const url = await photo.locator("img").first().getAttribute("src");
    expect(url).toMatch(/^\/files\/[0-9a-f-]{36}$/);
    const res = await page.request.get(url!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\//);
    expect(res.headers()["cache-control"]).toContain("immutable");
    // The sidebar's account card shows it at once.
    await page.reload();
    await expect(page.getByRole("complementary").locator(`img[src="${url}"]`)).toHaveCount(1);
    // Initials again, everywhere, for the next run.
    await photo.getByRole("button", { name: "Remove photo" }).click();
    await expect(page.getByText("Photo removed")).toBeVisible();
  });

  test("bookings calendar: views, the side pane and the remembered toggle", async ({
    browser,
    page,
  }) => {
    await bookFirstSlot(page, { name: "Calendar Guest", email: "calendar-guest@example.com" });
    const admin = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await admin.goto("/admin/bookings");
    await admin
      .getByRole("navigation", { name: "View" })
      .getByRole("link", { name: "Calendar" })
      .click();
    const calendar = admin.getByRole("region", { name: "Calendar" });
    await expect(calendar).toBeVisible({ timeout: 15_000 });
    // The booking is about two weeks out: the month view of its month shows it.
    await calendar.getByRole("link", { name: "Month" }).click();
    await expect(admin).toHaveURL(/cal=month/);
    let block = calendar.locator('a[href*="booking="]', { hasText: "Calendar Guest" });
    if ((await block.count()) === 0) {
      // A Button rendered as a link: Base UI gives it the button role, so match its label.
      await calendar.getByLabel(/Next month/).click();
      block = calendar.locator('a[href*="booking="]', { hasText: "Calendar Guest" });
    }
    await block.first().click();
    const pane = admin.locator('[data-slot="sheet-content"]');
    // The visible title (level 1); the dialog also has a screen-reader title with the same text.
    await expect(pane.getByRole("heading", { level: 1, name: /Calendar Guest/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(admin).toHaveURL(/booking=/);
    await expect(pane.getByRole("heading", { name: "Briefing" })).toBeVisible();
    await admin.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    await expect(admin).not.toHaveURL(/booking=/);
    // The legend names the event types in view.
    await expect(admin.getByRole("list", { name: "Event types" })).toContainText("Intro call");
    // The choice is remembered: the bare URL opens the calendar again.
    await admin.goto("/admin/bookings");
    await expect(admin.getByRole("region", { name: "Calendar" })).toBeVisible();
    // And the list is one click away, with the same pane behind each booking.
    await admin
      .getByRole("navigation", { name: "View" })
      .getByRole("link", { name: "List" })
      .click();
    await expect(admin.getByRole("region", { name: "Calendar" })).toHaveCount(0);
  });

  test("Home shows the day's counts, each linking to its list", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await page.goto("/admin");
    const strip = page.getByRole("list", { name: "Today at a glance" });
    await expect(strip).toBeVisible({ timeout: 15_000 });
    for (const [label, href] of [
      [/meetings? today/, "#today"],
      [/follow-ups? due/, "#keep-moving"],
      [/open tasks?/, "/admin/tasks?view=mine"],
    ] as const) {
      const link = strip.getByRole("link", { name: label });
      await expect(link).toHaveAttribute("href", href);
    }
    // The day, the people waiting and the next steps keep their places.
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Keep things moving" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your next steps" })).toBeVisible();
  });

  test("notifications: a booking rings the bell live, opens from the panel, marks read", async ({
    browser,
    page,
  }) => {
    const admin = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await admin.goto("/admin");
    const bell = admin.getByRole("button", { name: /^Notifications/ });
    await expect(bell).toBeVisible({ timeout: 15_000 });
    // Let the live feed connect before the booking happens.
    await admin.waitForTimeout(1_000);
    await bookFirstSlot(page, { name: "Bell Guest", email: "bell-guest@example.com" });
    // The stream brings the count in without a reload.
    await expect(bell).toHaveAccessibleName(/unread/, { timeout: 20_000 });
    await bell.click();
    const item = admin
      .getByRole("list", { name: "Notifications" })
      .getByRole("button", { name: /Bell Guest (booked|requested)/ });
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.click();
    await expect(admin).toHaveURL(/\/admin\/bookings\/[^/?]+$/);
    await bell.click();
    const markAll = admin.getByRole("button", { name: "Mark all read" });
    await expect(markAll).toBeVisible();
    if (await markAll.isEnabled()) await markAll.click();
    await expect(bell).toHaveAccessibleName("Notifications");
    // The per-kind grid saves.
    await admin.goto("/admin/notifications");
    await expect(admin.getByRole("heading", { name: /What you hear about/ })).toBeVisible();
    const paymentEmail = admin.getByLabel("Payment received: Email");
    await paymentEmail.check();
    const saved = admin.waitForResponse(
      (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
    );
    await admin
      .getByRole("region", { name: /What you hear about/ })
      .getByRole("button", { name: "Save" })
      .click();
    await saved;
    await expect(admin.getByText("Saved").first()).toBeVisible();
    // Saving the text / Slack switches below keeps the per-kind choices.
    await admin.getByLabel("an attendee cancels").uncheck();
    const savedPrefs = admin.waitForResponse(
      (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
    );
    await admin.getByRole("button", { name: "Save" }).last().click();
    await savedPrefs;
    await admin.reload();
    await expect(admin.getByLabel("Payment received: Email")).toBeChecked();
    await expect(admin.getByLabel("an attendee cancels")).not.toBeChecked();
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
    await expect(add).toBeEnabled();
    // Home lists the next few; the task list has them all.
    await page.goto("/admin/tasks?view=mine&layout=list");
    await expect(page.getByText(title)).toBeVisible();
  });
});
