import { expect, test } from "@playwright/test";
import { DEMO } from "./helpers";

/*
 * A collaborator (outside reviewer, ADR 0005) signs in and sees only their own profile and
 * schedule: every client-work and workspace page sends them to their profile.
 */
test("a collaborator sees only their own profile and schedule", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("collaborator@example.com");
  await page.locator('input[name="password"]').fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/admin\/profile/);

  const nav = page.getByRole("navigation", { name: "Admin" }).first();
  await expect(nav.getByRole("link", { name: "Availability" })).toBeVisible();
  for (const hidden of ["Home", "Contacts", "Bookings", "Settings", "Team"])
    await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);

  for (const path of [
    "/admin",
    "/admin/contacts",
    "/admin/bookings",
    "/admin/settings",
    "/admin/team",
  ]) {
    await page.goto(path);
    await expect(page, `${path} is closed to collaborators`).toHaveURL(/\/admin\/profile/);
  }
  await page.goto("/admin/availability");
  await expect(page).toHaveURL(/\/admin\/availability/);
});
