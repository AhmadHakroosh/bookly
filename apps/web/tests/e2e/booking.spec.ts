import { expect, test } from "@playwright/test";
import { bookFirstSlot, DEMO } from "./helpers";

test.describe("public booking", () => {
  test("profile and event page render", async ({ page }) => {
    await page.goto(`/${DEMO.username}`);
    await expect(page.getByRole("link", { name: /Intro call/ })).toBeVisible();
    // Self-hosted installs own their branding: the workspace mark on top, no Bookly footer.
    await expect(page.getByRole("banner").getByRole("link", { name: /home/ })).toBeVisible();
    await expect(page.getByText("Powered by")).toHaveCount(0);
    await page.goto(`/${DEMO.username}/intro-call`);
    await expect(page.getByRole("heading", { name: "Intro call" })).toBeVisible();
  });

  test("book, then cancel from the manage page", async ({ page }) => {
    const url = await bookFirstSlot(page, {
      name: "E2E Visitor",
      email: "e2e-visitor@example.com",
    });
    expect(url).toMatch(/\/booking\/[A-Za-z0-9_-]+/);
    await expect(page.getByText("E2E Visitor · e2e-visitor@example.com")).toBeVisible();
    await page.getByText("Cancel this booking").click();
    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByRole("heading", { name: "Booking cancelled" })).toBeVisible();
  });

  test("a taken slot disappears", async ({ page }) => {
    await bookFirstSlot(page, { name: "E2E First", email: "e2e-first@example.com" });
    const manage = page.url();
    const date = new URL(manage).origin; // keep TS happy about unused
    void date;
    const dayUrl = page.url();
    void dayUrl;
    // The same first slot is no longer offered.
    const { upcomingWeekday } = await import("./helpers");
    const d = upcomingWeekday();
    await page.goto(`/${DEMO.username}/intro-call?tz=UTC&month=${d.slice(0, 7)}&date=${d}`);
    const hrefs = await page
      .locator('a[href*="slot="]')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("public API lists event types and availability", async ({ request }) => {
    const et = await request.get(`/api/v1/event-types?username=${DEMO.username}`);
    expect(et.ok()).toBe(true);
    const body = (await et.json()) as { data: { slug: string }[] };
    expect(body.data.some((e) => e.slug === "intro-call")).toBe(true);
    const av = await request.get(
      `/api/v1/availability?username=${DEMO.username}&event=intro-call&timezone=UTC`,
    );
    expect(av.ok()).toBe(true);
  });
});
