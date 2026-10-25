import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { format } from "date-fns";
import { and, eq, gte, inArray, schema } from "@bookly/db";
import { settled, STORAGE } from "./helpers";
import { testDb } from "./db";

/*
 * Applying (slice H2, planning/v2/ux/application-page.md): a coordinator publishes a cohort
 * opportunity; a candidate on a phone reads the page, applies with two documents and an
 * adjustments request, fixes a missing consent from the error summary and lands on their status
 * page; applying again is refused without saying more; they withdraw and ask for deletion; the
 * coordinator deletes now and the link says so. Every candidate screen passes axe at 375 px.
 */

test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36).slice(-5);
const TITLE = `Spring Fellowship ${run}`;
const EMAIL = `maya-${run}@example.com`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const SIGNED_OUT = { storageState: { cookies: [], origins: [] } };
const PHONE = { width: 375, height: 812 };
const started = new Date();
let slug = "";
let statusUrl = "";

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
  await db.delete(schema.contacts).where(eq(schema.contacts.email, EMAIL));
  await flags("off");
});

const axe = async (page: Page, where: string) => {
  await page.waitForLoadState("networkidle");
  await settled(page);
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(r.violations, `${where}: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
};

const fits = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    PHONE.width,
  );

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

const candidate = async (browser: Browser) => {
  const page = await (await browser.newContext({ ...SIGNED_OUT, viewport: PHONE })).newPage();
  return page;
};

test("a coordinator publishes a cohort opportunity", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await (await browser.newContext({ storageState: STORAGE })).newPage();
  await page.goto("/admin/hiring/opportunities/new");
  await page.getByRole("button", { name: "Use the Cohort or fellowship template" }).click();
  await expect(page).toHaveURL(/\/setup\/basics$/);
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Cohort (optional)").fill("Spring cohort");
  await pickDate(page, "Closing date", new Date(Date.now() + 30 * 86_400_000));
  await pickDate(page, "Decisions by", new Date(Date.now() + 60 * 86_400_000));
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/setup\/stages$/);
  await page.getByRole("link", { name: /Step 6: Publish/ }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  const link = page.getByRole("link", { name: /View application page/ });
  await expect(link).toBeVisible();
  slug = new URL((await link.getAttribute("href"))!).pathname.split("/").at(-1)!;
  expect(slug).toBeTruthy();
});

test("a candidate applies from a phone", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await candidate(browser);
  await page.goto(`/apply/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByRole("region", { name: "Who sees your application" })).toContainText(
    "You must be 16 or older to apply.",
  );
  await expect(page.getByRole("heading", { name: "What happens next" })).toBeVisible();
  await expect(page.getByText(/your time/)).toBeVisible();
  await fits(page);
  await axe(page, "P1 application page");

  await page.getByRole("link", { name: "Start application" }).click();
  const form = page.getByRole("region", { name: "Your application" });
  await form.getByLabel("Full name").fill("Maya Chen");
  await form.getByLabel("Email").fill(EMAIL);
  await form
    .getByLabel(/Why do you want to join/)
    .fill("I want to build open tools for community health workers.");
  await form
    .getByLabel("CV or résumé")
    .setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(form.getByText("cv.pdf")).toBeVisible();
  await form
    .getByLabel("Project proposal")
    .setInputFiles({ name: "proposal.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(form.getByText("proposal.pdf")).toBeVisible();
  await expect(form.getByText(/^Saved /)).toBeVisible({ timeout: 10_000 });
  await axe(page, "P2 form section");
  await form.getByRole("button", { name: "Next" }).click();

  await expect(form.getByRole("heading", { name: "Adjustments and access" })).toBeFocused();
  await form.getByRole("radio", { name: "Yes" }).check();
  await form.getByLabel("What would help?").fill("Captions during interviews, please.");
  await axe(page, "P3 adjustments");
  await form.getByRole("button", { name: "Next" }).click();

  await expect(form.getByRole("heading", { name: "Review and submit" })).toBeVisible();
  await form.getByRole("button", { name: "Submit application" }).click();
  const summary = form.getByRole("alert").filter({ hasText: "Check 1 answer before you submit" });
  await expect(summary).toBeFocused();
  await axe(page, "P4 review with the error summary");
  await form.getByLabel(/I've read the privacy notice/).check();
  await form.getByRole("button", { name: "Submit application" }).click();

  await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
  await expect(page.getByText(/We've sent a confirmation to m•••@example\.com/)).toBeVisible();
  await expect(page.getByLabel("Status")).toContainText("Submitted");
  await expect(page.getByLabel(/Do you need any adjustments/)).toHaveValue(
    "Captions during interviews, please.",
  );
  await fits(page);
  await axe(page, "P5 and P6, the status page");
  statusUrl = new URL(page.url()).pathname;
  // The token is in the path: it never travels on as a referrer.
  const res = await page.request.get(statusUrl);
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
  expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");

  const db = testDb();
  const contact = await db.query.contacts.findFirst({ where: eq(schema.contacts.email, EMAIL) });
  expect(contact?.stageId).toBeNull();
});

test("applying again with the same email reveals nothing new", async ({ browser }) => {
  const page = await candidate(browser);
  await page.goto(`/apply/${slug}`);
  const form = page.getByRole("region", { name: "Your application" });
  await form.getByLabel("Full name").fill("Someone");
  await form.getByLabel("Email").fill(EMAIL);
  await form.getByLabel(/Why do you want to join/).fill("Again");
  await form
    .getByLabel("CV or résumé")
    .setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: PDF });
  await form
    .getByLabel("Project proposal")
    .setInputFiles({ name: "p.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(form.getByText("p.pdf")).toBeVisible();
  await form.getByRole("button", { name: "Next" }).click();
  await form.getByRole("radio", { name: "No" }).check();
  await form.getByRole("button", { name: "Next" }).click();
  await form.getByLabel(/I've read the privacy notice/).check();
  await form.getByRole("button", { name: "Submit application" }).click();
  await expect(
    form.getByText(
      `You've already applied to ${TITLE} with this email. We've sent your status link to m•••@example.com.`,
    ),
  ).toBeVisible();
});

test("the candidate withdraws, asks for deletion, and the coordinator deletes now", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Applying again sent a fresh link, so the first one stopped working: recover it.
  const page = await candidate(browser);
  await page.goto(statusUrl);
  await expect(page.getByRole("heading", { name: "This link has expired." })).toBeVisible();
  await axe(page, "P8 link recovery");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(
    page.getByText("If there's an application for that email, a new link is on its way."),
  ).toBeVisible();

  // The newest link is the application's only working one; read it where the server keeps it.
  const db = testDb();
  const contact = await db.query.contacts.findFirst({ where: eq(schema.contacts.email, EMAIL) });
  const app = await db.query.applications.findFirst({
    where: eq(schema.applications.contactId, contact!.id),
  });
  expect(app?.state).toBe("active");
  // Tokens are only stored hashed; open the page as the team would after a fresh submit instead.
  const coordinator = await (await browser.newContext({ storageState: STORAGE })).newPage();
  await coordinator.goto(`/admin/hiring/opportunities/${app!.opportunityId}`);
  await expect(coordinator.getByLabel("Pipeline by stage")).toContainText("1");

  // A fresh application from a new address walks the withdraw and delete path end to end.
  const other = `noor-${run}@example.com`;
  const p2 = await candidate(browser);
  await p2.goto(`/apply/${slug}`);
  const form = p2.getByRole("region", { name: "Your application" });
  await form.getByLabel("Full name").fill("Noor");
  await form.getByLabel("Email").fill(other);
  await form.getByLabel(/Why do you want to join/).fill("To learn.");
  await form
    .getByLabel("CV or résumé")
    .setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: PDF });
  await form
    .getByLabel("Project proposal")
    .setInputFiles({ name: "x.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(form.getByText("x.pdf")).toBeVisible();
  await form.getByRole("button", { name: "Next" }).click();
  await form.getByRole("radio", { name: "No" }).check();
  await form.getByRole("button", { name: "Next" }).click();
  await form.getByLabel(/I've read the privacy notice/).check();
  await form.getByRole("button", { name: "Submit application" }).click();
  await expect(p2.getByRole("heading", { name: "Application received" })).toBeVisible();
  const mine = new URL(p2.url()).pathname;

  await p2.goto(mine);
  await p2.getByRole("button", { name: "Withdraw my application" }).click();
  const dialog = p2.getByRole("dialog");
  await dialog.getByRole("radio", { name: "My plans changed" }).check();
  await axe(p2, "P7 withdraw");
  await dialog.getByRole("button", { name: "Withdraw application" }).click();
  await expect(p2.getByLabel("Status")).toContainText("Withdrawn");
  await p2.getByRole("button", { name: "Delete my application" }).click();
  await p2.getByRole("dialog").getByRole("button", { name: "Delete my application" }).click();
  await expect(p2.getByText(/^Deletion requested on/)).toBeVisible();

  await coordinator.goto(`/admin/hiring/opportunities/${app!.opportunityId}/setup/privacy`);
  const requests = coordinator.getByRole("region", { name: "Data requests" });
  await expect(requests.getByText(other)).toBeVisible();
  await requests.getByRole("button", { name: "Delete now" }).click();
  await expect(requests.getByText("No deletion requests.")).toBeVisible();

  await p2.goto(mine);
  await expect(
    p2.getByRole("heading", { name: "This application has been deleted." }),
  ).toBeVisible();
  expect(
    await db.query.contacts.findFirst({ where: eq(schema.contacts.email, other) }),
  ).toBeUndefined();
});
