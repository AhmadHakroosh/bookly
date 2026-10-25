import { expect, test } from "@playwright/test";
import { and, eq, schema } from "@bookly/db";
import { settled, STORAGE } from "./helpers";
import { testDb } from "./db";
import AxeBuilder from "@axe-core/playwright";

/*
 * Stage automations (ADR 0002, slice S6): a manager adds an automation to Won in the pipeline
 * editor; a client moved to Won gets the checklist and the welcome email once, and running the
 * sweep again changes nothing. `pipelines` and `stage_rules` are switched on for this file only.
 */

test.use({ storageState: STORAGE });

const run = Date.now().toString(36).slice(-5);
const NAME = `Onboard ${run}`;
const EMAIL = `won-${run}@example.com`;
let contactId = "";

test.beforeAll(async () => {
  const db = testDb();
  for (const key of ["pipelines", "stage_rules"])
    await db
      .insert(schema.featureFlags)
      .values({ key, description: key, state: "on" })
      .onConflictDoUpdate({ target: schema.featureFlags.key, set: { state: "on" } });
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.slug, "demo") });
  const [c] = await db
    .insert(schema.contacts)
    .values({ workspaceId: ws!.id, email: EMAIL, name: `Won Client ${run}`, stage: "lead" })
    .returning({ id: schema.contacts.id });
  contactId = c!.id;
});

test.afterAll(async () => {
  const db = testDb();
  // Leave the board and the Won stage as other specs expect them.
  await db.delete(schema.tasks).where(eq(schema.tasks.contactId, contactId));
  await db.delete(schema.stageRules).where(eq(schema.stageRules.name, NAME));
  for (const key of ["pipelines", "stage_rules"])
    await db
      .update(schema.featureFlags)
      .set({ state: "off" })
      .where(eq(schema.featureFlags.key, key));
});

test("a client who reaches Won gets the checklist and the welcome email, once", async ({
  page,
  request,
}) => {
  await page.goto("/admin/settings/pipeline");
  const won = page.getByRole("region", { name: "Automations for Won" });
  await won.getByRole("button", { name: "Add an automation to Won" }).click();
  await won.getByLabel("Automation name").fill(NAME);

  await won.getByRole("combobox", { name: "Action to add" }).click();
  await page.getByRole("option", { name: "Create tasks", exact: true }).click();
  await won.getByRole("button", { name: "Add action" }).click();
  await won
    .getByLabel("Action 1: tasks, one per line")
    .fill("Send the contract\nBook the kick-off call");

  await won.getByRole("combobox", { name: "Action to add" }).click();
  await page.getByRole("option", { name: "Send an email", exact: true }).click();
  await won.getByRole("button", { name: "Add action" }).click();
  await won.getByLabel("Action 2: subject").fill("Welcome aboard, {name}");
  await won.getByLabel("Action 2: message").fill("Hi {name}, the contract is on its way.");
  await won.getByRole("button", { name: "Save automation" }).click();

  const saved = won.getByRole("listitem").filter({ hasText: NAME });
  await expect(saved).toBeVisible();
  await expect(saved.getByText("Create 2 tasks")).toBeVisible();
  await settled(page);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);

  // The client reaches Won.
  await page.goto(`/admin/contacts/${contactId}`);
  await page.getByRole("combobox", { name: "Stage" }).click();
  await page.getByRole("option", { name: "Won", exact: true }).click();
  await expect(page.getByText(/Stage: .* → Won/)).toBeVisible();

  // The automation runs right after the move.
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText(`Automation "${NAME}" ran`).count();
      },
      { timeout: 20_000 },
    )
    .toBe(1);
  await expect(page.getByText(`Welcome aboard, Won Client ${run}`).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Mark done: Send the contract/ }).first(),
  ).toBeVisible();

  // Running the sweep again does not run it twice.
  const secret = process.env.CRON_SECRET;
  if (secret)
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request.get("/api/cron/tick", { headers: { authorization: `Bearer ${secret}` } })
        ).ok(),
      ).toBe(true);
  const db = testDb();
  const tasks = await db.query.tasks.findMany({ where: eq(schema.tasks.contactId, contactId) });
  expect(tasks.map((t) => t.title).sort()).toEqual(["Book the kick-off call", "Send the contract"]);
  const runs = await db.query.stageRuleRuns.findMany({
    where: and(eq(schema.stageRuleRuns.subjectId, contactId)),
  });
  expect(runs.map((r) => [r.status, r.results])).toEqual([["done", ["done", "done"]]]);
});
