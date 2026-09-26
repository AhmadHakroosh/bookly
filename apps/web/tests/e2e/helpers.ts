import { expect, type Page } from "@playwright/test";

/** Saved session from auth.setup.ts, reused by admin tests. */
export const STORAGE = "tests/e2e/.auth/demo.json";

export const DEMO = { email: "demo@example.com", password: "demo-password-1234", username: "demo" };

/** A weekday about two weeks out, as YYYY-MM-DD, so slots are always inside the horizon. */
export function upcomingWeekday(daysAhead = 14): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function signIn(page: Page) {
  await page.goto("/login?next=%2Fadmin");
  await page.locator('input[name="email"]').fill(DEMO.email);
  await page.locator('input[name="password"]').fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
}

/** Books the first slot on a day and returns the manage-page URL. */
export async function bookFirstSlot(
  page: Page,
  attendee: { name: string; email: string },
  opts: { guests?: string[] } = {},
) {
  const date = upcomingWeekday();
  await page.goto(`/${DEMO.username}/intro-call?tz=UTC&month=${date.slice(0, 7)}&date=${date}`);
  const slot = page.locator('a[href*="slot="]').first();
  await expect(slot).toBeVisible();
  await slot.click();
  await page.getByLabel("Name", { exact: true }).fill(attendee.name);
  await page.getByLabel("Email", { exact: true }).fill(attendee.email);
  if (opts.guests) await page.locator('textarea[name="guests"]').fill(opts.guests.join("\n"));
  // Answer every booking question the event type asks (required ones block the form).
  for (const q of await page.locator('[name^="q_"]').all()) {
    const tag = await q.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") await q.selectOption({ index: 1 });
    else if ((await q.getAttribute("type")) === "hidden") continue;
    else await q.fill("E2E answer");
  }
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  return page.url();
}
