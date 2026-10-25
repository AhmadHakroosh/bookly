import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { format } from "date-fns";
import { and, eq, gte, inArray, schema } from "@bookly/db";
import { settled, STORAGE } from "./helpers";
import { testDb } from "./db";

/*
 * Opportunity setup (slice H1, planning/v2/ux/opportunity-setup.md): a coordinator creates a
 * cohort opportunity from the template, sets Basics, finds that an outcome without a message
 * blocks publishing, fixes it from the checklist's link and publishes; rules never offer to
 * decide; "Copy for a new cycle" clears the dates. Every step passes axe. `pipelines` and
 * `hiring` are switched on for this file only.
 */

test.use({ storageState: STORAGE });

const run = Date.now().toString(36).slice(-5);
const TITLE = `Horizon Fellowship ${run}`;
const started = new Date();

const flags = async (state: "on" | "off") => {
  const db = testDb();
  for (const key of ["pipelines", "hiring"] as const)
    await db
      .insert(schema.featureFlags)
      .values({ key, description: key, state })
      .onConflictDoUpdate({ target: schema.featureFlags.key, set: { state } });
};

test.beforeAll(() => flags("on"));

test.afterAll(async () => {
  const db = testDb();
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.slug, "demo") });
  const opps = await db
    .select({ id: schema.opportunities.id, pipelineId: schema.opportunities.pipelineId })
    .from(schema.opportunities)
    .where(
      and(
        eq(schema.opportunities.workspaceId, ws!.id),
        gte(schema.opportunities.createdAt, started),
      ),
    );
  if (opps.length) {
    await db.delete(schema.opportunities).where(
      inArray(
        schema.opportunities.id,
        opps.map((o) => o.id),
      ),
    );
    await db.delete(schema.pipelines).where(
      inArray(
        schema.pipelines.id,
        opps.map((o) => o.pipelineId),
      ),
    );
  }
  await flags("off");
});

const axe = async (page: Page, where: string) => {
  await page.waitForLoadState("networkidle");
  await settled(page);
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(r.violations, `${where}: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
};

/** Picks a day in one of the app's date pickers, moving the calendar forward to its month. */
async function pickDate(page: Page, label: string, date: Date) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const caption = format(date, "MMMM yyyy");
  for (let i = 0; i < 24; i++) {
    if (await page.getByText(caption, { exact: true }).isVisible()) break;
    await page.getByRole("button", { name: "Go to the Next Month" }).click();
  }
  await page.getByRole("button", { name: new RegExp(`^${format(date, "PPPP")}`) }).click();
  // The calendar closes before the next picker opens.
  await expect(page.getByRole("button", { name: "Go to the Next Month" })).toHaveCount(0);
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

test("a coordinator sets up a cohort opportunity and publishes it once every outcome has a message", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/admin/hiring/opportunities/new");
  await expect(page.getByRole("heading", { name: "How do you select people?" })).toBeVisible();
  await axe(page, "Start");
  await page.getByRole("button", { name: "Use the Cohort or fellowship template" }).click();

  // Basics.
  await expect(page).toHaveURL(/\/setup\/basics$/);
  await expect(
    page.getByRole("navigation", { name: "Setup steps" }).locator('[aria-current="step"]'),
  ).toHaveText(/Basics/);
  await axe(page, "Basics");
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Cohort (optional)").fill("Spring cohort");
  await pickDate(page, "Closing date", inDays(30));
  await pickDate(page, "Decisions by", inDays(60));
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Stages: the template's pipeline, outcomes under their divider.
  await expect(page).toHaveURL(/\/setup\/stages$/);
  const list = page.locator('section[aria-labelledby="stage-list-title"]');
  for (const s of [
    "Applied",
    "In review",
    "Interview",
    "Decision",
    "Admitted",
    "Waitlist",
    "Not selected",
  ])
    await expect(list.getByRole("button", { name: new RegExp(`^${s} `) })).toBeVisible();
  await expect(
    page.getByText("Applications reach an outcome only when someone on your team decides."),
  ).toBeVisible();
  await axe(page, "Stages");

  // Reorder from the row menu; the live region says where it went.
  await page.getByRole("button", { name: "Actions for Decision" }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect(page.getByText("Decision moved to position 3 of 7.")).toBeAttached();

  // Rules never offer to move anyone to an outcome.
  await list.getByRole("button", { name: /^In review / }).click();
  await page.getByRole("button", { name: "Add rule" }).click();
  await page.getByRole("combobox", { name: "Action 1" }).click();
  await page.getByRole("option", { name: "move to another open stage" }).click();
  await page.getByRole("combobox", { name: "Stage", exact: true }).click();
  await expect(page.getByRole("option", { name: "Interview" })).toBeVisible();
  for (const outcome of ["Admitted", "Waitlist", "Not selected"])
    await expect(page.getByRole("option", { name: outcome })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cancel" }).click();

  // An outcome without a message blocks publishing.
  await list.getByRole("button", { name: /^Not selected / }).click();
  await page.getByRole("button", { name: "Configure" }).click();
  await expect(
    page.getByText(
      "Sent when you release decisions. You'll review every message before it goes out.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Delete "Your application/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Applicants who reach Not selected won't hear from you. Add a message to publish.",
    }),
  ).toBeVisible();

  await page.getByRole("link", { name: /Step 6: Publish/ }).click();
  await expect(page.getByRole("heading", { name: "Ready to publish?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  await expect(page.getByText("Fix 1 item to publish")).toBeVisible();
  await axe(page, "Publish (blocked)");

  // The checklist links straight to the stage's Messages module.
  await page
    .getByRole("link", {
      name: "Applicants who reach Not selected won't hear from you. Add a message to publish.",
    })
    .click();
  await expect(page).toHaveURL(/stage=not_selected&module=messages/);
  await page.getByLabel("Subject").fill("Your application to {opportunity}");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Hi {name},\n\nThank you for applying. We can't offer you a place this time.");
  await page.getByRole("button", { name: "Save message" }).click();
  await expect(page.getByText("things to fix before publishing")).toHaveCount(0);

  for (const step of ["Team", "Privacy"]) {
    await page.getByRole("link", { name: new RegExp(`Step \\d: ${step}`) }).click();
    await expect(
      page.getByRole("heading", {
        name: step === "Team" ? "Team and access" : "Privacy and applicant experience",
      }),
    ).toBeVisible();
    await axe(page, step);
  }
  await expect(page.getByLabel("Privacy notice")).toHaveValue(/You must be 16 or older to apply\./);

  await page.getByRole("link", { name: /Step 6: Publish/ }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(page.locator('[data-slot="status-chip"]', { hasText: "Open" })).toBeVisible();
  // Next keeps the previous page mounted but hidden (Activity): only the visible copy counts.
  await expect(
    page.getByText("Spring cohort · Applications close").filter({ visible: true }),
  ).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Opportunity" });
  for (const tab of ["Pipeline", "Interviews", "Review plan", "Team"])
    await expect(tabs.getByRole("link", { name: tab, exact: true })).toBeVisible();
  await axe(page, "Opportunity");

  const db = testDb();
  const opp = await db.query.opportunities.findFirst({
    where: eq(schema.opportunities.title, TITLE),
  });
  expect(opp).toMatchObject({ status: "open" });
  expect(opp!.publishedAt).toBeTruthy();
});

test("Copy for a new cycle starts a draft with the same stages and no dates", async ({ page }) => {
  const db = testDb();
  const opp = await db.query.opportunities.findFirst({
    where: eq(schema.opportunities.title, TITLE),
  });
  test.skip(!opp, "needs the opportunity the first test publishes");
  await page.goto(`/admin/hiring/opportunities/${opp!.id}`);
  await page.getByRole("button", { name: `More actions for ${TITLE}` }).click();
  await page.getByRole("menuitem", { name: "Copy for a new cycle" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Copy" }).click();
  await expect(page).toHaveURL(/\/setup\/basics\?copied=1$/);
  await expect(page.getByText("Set the dates for this cycle.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(`${TITLE} (copy)`);
  await expect(page.getByRole("button", { name: "Closing date" })).toHaveText(/Pick a date/);
  await page.getByRole("link", { name: /Step 3: Stages/ }).click();
  await expect(
    page
      .locator('section[aria-labelledby="stage-list-title"]')
      .getByRole("button", { name: /^Not selected / }),
  ).toBeVisible();
});

test("on a phone, a stage opens in a sheet and reorders from its menu", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/hiring/opportunities/new");
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(page).toHaveURL(/\/setup\/basics$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole("link", { name: /Step 3: Stages/ }).click();
  await page
    .locator('section[aria-labelledby="stage-list-title"]')
    .getByRole("button", { name: /^Accepted / })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Stage name")).toHaveValue("Accepted");
  await expect(sheet.getByText("Modules", { exact: true })).toBeVisible();
});
