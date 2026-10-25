import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { format } from "date-fns";
import { and, eq, gte, inArray, schema } from "@bookly/db";
import { settled, STORAGE } from "./helpers";
import { testDb } from "./db";

/*
 * The hiring board (slice H3, hiring.png): a coordinator opens a published cohort opportunity
 * with applications in it; moves one with a card's menu and one by dragging; opens the
 * candidate pane and moves on from a stage with reviews missing through "Move anyway", which
 * the activity log records; follows Needs attention to the flagged list and moves people in
 * bulk. The board, the pane and the list pass axe. (Outcomes refusing a move is unit-tested:
 * the outcome columns sit past the edge of a laptop screen.)
 */

test.describe.configure({ mode: "serial" });
test.use({ storageState: STORAGE });

const run = Date.now().toString(36).slice(-5);
const TITLE = `Board Fellowship ${run}`;
const PEOPLE = ["Jordan Lee", "Priya Nair", "Daniel Kim", "Leah Park"];
const email = (name: string) => `${name.toLowerCase().replace(" ", ".")}-${run}@example.com`;
const started = new Date();
let oppId = "";
let stage: Record<string, string> = {};

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
  await db.delete(schema.contacts).where(inArray(schema.contacts.email, PEOPLE.map(email)));
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

async function pickDate(page: Page, label: string, date: Date) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const caption = format(date, "MMMM yyyy");
  for (let i = 0; i < 24; i++) {
    if (await page.getByText(caption, { exact: true }).isVisible()) break;
    await page.getByRole("button", { name: "Go to the Next Month" }).click();
  }
  await page.getByRole("button", { name: new RegExp(`^${format(date, "PPPP")}`) }).click();
  await expect(page.getByRole("button", { name: "Go to the Next Month" })).toHaveCount(0);
}

const board = (page: Page) => page.getByRole("region", { name: "Pipeline by stage" });
const column = (page: Page, name: string) => board(page).getByRole("region", { name, exact: true });
const card = (where: Locator, name: string) =>
  where
    .getByRole("listitem")
    .filter({ has: where.page().getByRole("link", { name, exact: true }) });

/** A real pointer drag: press, move past the activation distance, glide to the target, release. */
async function drag(page: Page, from: Locator, to: Locator) {
  await page.waitForLoadState("networkidle");
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 60, { steps: 15 });
  await page.mouse.up();
}

const audited = async (action: string) => {
  const rows = await testDb()
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, action), gte(schema.auditLog.createdAt, started)));
  return rows;
};

test("a coordinator's opportunity has applications on its board", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/admin/hiring/opportunities/new");
  await page.getByRole("button", { name: "Use the Cohort or fellowship template" }).click();
  await expect(page).toHaveURL(/\/setup\/basics$/);
  await page.getByLabel("Title").fill(TITLE);
  await pickDate(page, "Closing date", new Date(Date.now() + 30 * 86_400_000));
  await pickDate(page, "Decisions by", new Date(Date.now() + 60 * 86_400_000));
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/setup\/stages$/);
  await page.getByRole("link", { name: /Step 6: Publish/ }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  oppId = new URL(page.url()).pathname.split("/")[4]!;

  // Applications arrive through the public page (H2's spec); here they are seeded.
  const db = testDb();
  const opp = (await db.query.opportunities.findFirst({
    where: eq(schema.opportunities.id, oppId),
  }))!;
  const cohort = (await db.query.opportunityCohorts.findFirst({
    where: eq(schema.opportunityCohorts.opportunityId, oppId),
  }))!;
  const stages = await db
    .select()
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.pipelineId, opp.pipelineId));
  stage = Object.fromEntries(stages.map((s) => [s.key, s.id]));
  for (const [i, name] of PEOPLE.entries()) {
    const [c] = await db
      .insert(schema.contacts)
      .values({ workspaceId: opp.workspaceId, email: email(name), name })
      .returning();
    await db.insert(schema.applications).values({
      workspaceId: opp.workspaceId,
      opportunityId: oppId,
      cohortId: cohort.id,
      contactId: c!.id,
      stageId: stage.applied!,
      stageEnteredAt: new Date(Date.now() - (10 - i) * 86_400_000),
      submittedAt: new Date(Date.now() - (10 - i) * 86_400_000),
      state: "active",
      flags:
        name === "Priya Nair"
          ? [
              {
                kind: "requirement",
                requirement: "Eligible to work in the EU",
                ruleId: "e2e",
                at: new Date().toISOString(),
              },
            ]
          : [],
    });
  }
  await page.reload();
  const applied = column(page, "Applied");
  await expect(applied.getByRole("link")).toHaveCount(4);
  await expect(card(applied, "Priya Nair")).toContainText(
    "Doesn't meet: Eligible to work in the EU",
  );
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByText("1 application flagged")).toBeVisible();
  await axe(page, "the board");
});

test("moves with a card's menu and by dragging", async ({ page }) => {
  await page.goto(`/admin/hiring/opportunities/${oppId}`);
  const applied = column(page, "Applied");
  await applied.getByRole("button", { name: "More for Jordan Lee" }).click();
  await page.getByRole("menuitem", { name: "Move to" }).click();
  await page.getByRole("menuitem", { name: "In review" }).click();
  await expect(page.getByText("Moved to In review")).toBeVisible();
  await expect(card(column(page, "In review"), "Jordan Lee")).toBeVisible();

  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
  );
  await drag(page, card(applied, "Daniel Kim"), column(page, "In review"));
  await expect(card(column(page, "In review"), "Daniel Kim")).toBeVisible();
  await saved;
  await page.reload();
  await expect(column(page, "In review").getByRole("link")).toHaveCount(2);
  expect((await audited("application.moved")).length).toBeGreaterThanOrEqual(2);
});

test("the candidate pane moves on with Move anyway, and the log says so", async ({ page }) => {
  await page.goto(`/admin/hiring/opportunities/${oppId}`);
  await card(column(page, "In review"), "Jordan Lee").getByRole("link").click();
  await expect(page).toHaveURL(/application=/);
  const pane = page.getByRole("dialog", { name: "Application" });
  await expect(pane.getByRole("heading", { name: "Jordan Lee" })).toBeVisible();
  await expect(pane.getByText("Access limited to assigned reviewers")).toBeVisible();
  await expect(pane.getByText("0 of 3 submitted")).toBeVisible();
  await axe(page, "the candidate pane");

  await pane.getByRole("button", { name: /Stage: In review/ }).click();
  await page.getByRole("menuitemradio", { name: "Interview" }).click();
  const confirm = page.getByRole("dialog", { name: /3 of 3 reviews missing\. Move anyway\?/ });
  await expect(confirm).toContainText("Moving anyway is recorded in the activity log.");
  await confirm.getByRole("button", { name: "Move anyway" }).click();
  await expect(confirm).toBeHidden();
  await expect(pane.getByRole("button", { name: /Stage: Interview/ })).toBeVisible();
  const [row] = await audited("application.exit_check_overridden");
  expect(row?.changes).toMatchObject({ check: { to: "reviews_missing" } });
});

test("Needs attention leads to the flagged list, and people move in bulk", async ({ page }) => {
  await page.goto(`/admin/hiring/opportunities/${oppId}`);
  await page.getByRole("link", { name: "View candidates" }).click();
  await expect(page).toHaveURL(/view=list&filter=flagged/);
  const table = page.getByRole("table");
  await expect(table.getByRole("link")).toHaveCount(1);
  await expect(table).toContainText("Priya Nair");
  await axe(page, "the flagged list");

  await page.getByRole("button", { name: /^All/ }).click();
  await table.getByRole("checkbox", { name: "Select Priya Nair" }).click();
  await table.getByRole("checkbox", { name: "Select Leah Park" }).click();
  const bar = page.getByRole("region", { name: "Selected applications" });
  await expect(bar).toContainText("2 selected");
  await bar.getByRole("button", { name: "Move to…" }).click();
  await page.getByRole("menuitem", { name: "In review" }).click();
  await expect(page.getByText("Moved 2 to In review")).toBeVisible();
  await expect(bar).toBeHidden();
  const db = testDb();
  const rows = await db
    .select({ stageId: schema.applications.stageId })
    .from(schema.applications)
    .where(eq(schema.applications.opportunityId, oppId));
  // Daniel, Priya and Leah; Jordan went on to Interview.
  expect(rows.filter((r) => r.stageId === stage.in_review)).toHaveLength(3);
  expect(rows.filter((r) => r.stageId === stage.interview)).toHaveLength(1);
});
