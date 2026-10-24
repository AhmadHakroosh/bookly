import { expect, test, type Page } from "@playwright/test";
import { eq, schema } from "@bookly/db";
import { createHash, randomBytes } from "node:crypto";
import { STORAGE } from "./helpers";
import { testDb } from "./db";

/*
 * The client pipeline (ADR 0001, slice S2): behind `pipelines` a workspace adds, reorders,
 * renames and archives its contact stages, contacts move between them from the admin and the
 * API, and the timeline names the stages. The flag is switched on for this file only.
 */

test.use({ storageState: STORAGE });

// Unique per run, so a reused test database does not hold two stages with the same name.
const run = Date.now().toString(36).slice(-5);
const ADDED = `Proposal ${run}`;
const RENAMED = `Proposal sent ${run}`;
const EMAIL = `pipeline-${run}@example.com`;
let apiKey = "";

test.beforeAll(async () => {
  const db = testDb();
  await db
    .insert(schema.featureFlags)
    .values({ key: "pipelines", description: "Pipelines", state: "on" })
    .onConflictDoUpdate({ target: schema.featureFlags.key, set: { state: "on" } });
  const ws = await db.query.workspaces.findFirst({ where: eq(schema.workspaces.slug, "demo") });
  apiKey = `bk_${randomBytes(24).toString("base64url")}`;
  await db.insert(schema.apiKeys).values({
    workspaceId: ws!.id,
    name: `e2e pipelines ${run}`,
    prefix: apiKey.slice(0, 10),
    keyHash: createHash("sha256").update(apiKey).digest("hex"),
    scopes: ["bookings:read", "bookings:write"],
  });
});

test.afterAll(async () => {
  const db = testDb();
  await db
    .update(schema.featureFlags)
    .set({ state: "off" })
    .where(eq(schema.featureFlags.key, "pipelines"));
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.name, `e2e pipelines ${run}`));
});

const names = (page: Page) =>
  page
    .locator('input[aria-label="Stage name"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
const card = (page: Page, name: string) =>
  page
    .locator("li")
    .filter({ has: page.locator(`input[aria-label="Stage name"][value="${name}"]`) });
const auth = () => ({ authorization: `Bearer ${apiKey}` });

async function pickStage(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Stage" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await page.getByRole("button", { name: "Update" }).click();
}

test("the pipeline editor shapes the stages contacts move through", async ({ page, request }) => {
  await page.goto("/admin/settings/pipeline");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

  // Add: a new open stage lands at the end.
  await page.getByLabel("New stage name").fill(ADDED);
  await page.getByRole("button", { name: "Add stage" }).click();
  await expect(card(page, ADDED)).toBeVisible();
  const before = await names(page);
  expect(before.at(-1)).toBe(ADDED);
  const key = (await card(page, ADDED).locator("code").textContent())!.trim();

  // Reorder: one place up.
  await card(page, ADDED)
    .getByRole("button", { name: `Move ${ADDED} up` })
    .click();
  await expect.poll(() => names(page)).toEqual([...before.slice(0, -2), ADDED, before.at(-2)]);

  // Rename: the key stays.
  await card(page, ADDED).getByLabel("Stage name").fill(RENAMED);
  await card(page, ADDED).getByRole("button", { name: "Save" }).click();
  await expect(card(page, RENAMED)).toBeVisible();
  await expect(card(page, RENAMED).locator("code")).toHaveText(key);

  // API: the pipeline lists it, a contact is put in it by key, unknown keys are refused.
  const pipelines = await (await request.get("/api/v1/pipelines", { headers: auth() })).json();
  expect(pipelines.data[0].stages).toContainEqual(
    expect.objectContaining({ key, name: RENAMED, category: "open" }),
  );
  const created = await request.post("/api/v1/contacts", {
    headers: auth(),
    data: { email: EMAIL, name: `Pipeline ${run}`, stage: key },
  });
  expect(created.status()).toBe(201);
  expect((await created.json()).data).toMatchObject({
    email: EMAIL,
    stage: "lead",
    stageKey: key,
    stageName: RENAMED,
    stageId: expect.any(String),
  });
  const listed = await request.get(`/api/v1/contacts?stage=${key}`, { headers: auth() });
  expect((await listed.json()).data.map((c: { email: string }) => c.email)).toContain(EMAIL);
  const unknown = await request.get("/api/v1/contacts?stage=no-such-stage", { headers: auth() });
  expect(unknown.status()).toBe(400);

  // Admin: the list has a tab for it and the contact page moves the contact on, by name.
  await page.goto("/admin/contacts");
  await expect(page.getByRole("link", { name: RENAMED, exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(`Pipeline ${run}`) })
    .first()
    .click();
  await expect(page.getByRole("combobox", { name: "Stage" })).toContainText(RENAMED);
  await pickStage(page, "Active");
  await expect(page.getByText(`Stage: ${RENAMED} → Active`)).toBeVisible();
  await pickStage(page, RENAMED);
  await expect(page.getByText(`Stage: Active → ${RENAMED}`)).toBeVisible();
  const contactUrl = page.url();

  // Archive: the people in it move where the manager says.
  await page.goto("/admin/settings/pipeline");
  await card(page, RENAMED)
    .getByRole("combobox", { name: `Move the people in ${RENAMED} to` })
    .click();
  await page.getByRole("option", { name: "Won", exact: true }).click();
  await card(page, RENAMED).getByRole("button", { name: "Archive" }).click();
  await expect(card(page, RENAMED)).toHaveCount(0);
  await page.goto(contactUrl);
  await expect(page.getByRole("combobox", { name: "Stage" })).toContainText("Won");
});
