import { expect, test } from "@playwright/test";
import { bookFirstSlot, STORAGE } from "./helpers";

test.describe("admin", () => {
  test("wrong password is refused", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("demo@example.com");
    await page.locator('input[name="password"]').fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("inbox, bookings, brief, capture, contact", async ({ browser, page }) => {
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
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
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
