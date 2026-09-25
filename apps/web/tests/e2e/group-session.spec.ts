import { expect, test, type Page } from "@playwright/test";
import { DEMO, STORAGE, upcomingWeekday } from "./helpers";

/**
 * The demo "Working session" is a group of three, weekly, six times. Guests see the seats left
 * on every time, the numbers on their booking page, and the waitlist once the session is full;
 * the host sees who is in the session and who is waiting.
 */
const SHOTS = process.env.SHOTS_DIR;
const date = upcomingWeekday(21);
const day = `/${DEMO.username}/working-session?tz=UTC&month=${date.slice(0, 7)}&date=${date}`;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

async function book(page: Page, slot: string, name: string, email: string) {
  await page.goto(`${day}&slot=${encodeURIComponent(slot)}`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: /Book 6 sessions/ }).click();
  await expect(page).toHaveURL(/\/booking\//);
}

test.describe.serial("group session", () => {
  let slot = "";
  let manage = "";

  test("guests see seats left, fill the session and join the waitlist", async ({ page }) => {
    await page.goto(day);
    await expect(page.getByText("6 sessions")).toBeVisible();
    await expect(page.getByText("Group of up to 3")).toBeVisible();
    const first = page.locator('a[href*="slot="]').first();
    await expect(first).toContainText("3 seats left");
    slot = new URL((await first.getAttribute("href"))!, page.url()).searchParams.get("slot")!;
    await shot(page, "booking-day-desktop");

    await book(page, slot, "Noa Levi", "noa@acme.example");
    await expect(page.getByText("1 / 3 seats")).toBeVisible();
    await expect(page.getByText("You are the first to book this session.")).toBeVisible();
    await page.goto(day);
    await expect(page.locator('a[href*="slot="]').first()).toContainText("2 seats left");

    await book(page, slot, "Tom Adler", "tom@acme.example");
    await book(page, slot, "Priya Nair", "priya@acme.example");
    await expect(page.getByText("3 / 3 seats")).toBeVisible();
    await expect(page.getByText("It is full.")).toBeVisible();
    manage = page.url();

    await page.goto(day);
    const full = page.locator('a[href*="waitlist="]').first();
    await expect(full).toContainText("Full · waitlist");
    await full.click();
    await page.getByLabel("Name", { exact: true }).fill("Dana Weiss");
    await page.getByLabel("Email", { exact: true }).fill("dana@northwind.example");
    await page.getByRole("button", { name: "Notify me" }).click();
    await expect(page.getByText("You're on the list")).toBeVisible();

    await page.goto(day);
    await expect(page.locator('a[href*="waitlist="]').first()).toContainText("Full · 1 waiting");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(day);
    await expect(page.locator('a[href*="waitlist="]').first()).toBeVisible();
    await shot(page, "booking-day-mobile");
    await page.goto(manage);
    await expect(page.getByText("Waitlist: 1 person")).toBeVisible();
    await shot(page, "manage-mobile");
  });

  test("the host sees who is in the session and who is waiting", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE });
    const page = await ctx.newPage();
    await page.goto("/admin/bookings");
    // One card per session: the series has six, each with the same three people.
    await expect(page.getByText("3 / 3 seats")).toHaveCount(6);
    for (const name of ["Noa Levi", "Tom Adler", "Priya Nair"])
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Waitlist: 1 person")).toBeVisible();
    await expect(page.getByText("Dana Weiss")).toBeVisible();
    await shot(page, "admin-bookings-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/bookings");
    await expect(page.getByText("Waitlist: 1 person")).toBeVisible();
    await shot(page, "admin-bookings-mobile");
    await page.setViewportSize({ width: 1280, height: 900 });

    await page
      .locator("li", { hasText: "Working session" })
      .first()
      .getByRole("link", { name: "Brief" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/bookings\/[0-9a-f-]+$/);
    const who = page.locator("section", { hasText: "Who is in this session" });
    await expect(who.getByText("3 / 3 seats")).toBeVisible();
    for (const name of ["Noa Levi", "Tom Adler", "Priya Nair"])
      await expect(who.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText("Session 1 of 6").first()).toBeVisible();
    await shot(page, "admin-booking-detail");
    await ctx.close();
  });
});
