import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { and, eq, schema } from "@bookly/db";
import { STORAGE, upcomingWeekday } from "./helpers";
import { testDb } from "./db";

/*
 * The form builder (ADR 0004, slice S4) behind `forms_v2`: an event type gets a yes-or-no
 * question and a file question shown only on "yes", a routing form a dropdown and a question
 * shown only for one option; both are published and answered on their public pages. The upload
 * endpoint refuses what it should. The flag is switched on for this file only, and the event
 * type and routing form are this file's own.
 */

const run = Date.now().toString(36).slice(-5);
const SLUG = `forms-${run}`;
/** A browser context with nobody signed in (this file's `use` would sign every one in). */
const SIGNED_OUT = { storageState: { cookies: [], origins: [] } };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let eventTypeId = "";
let routingId = "";

test.beforeAll(async () => {
  const db = testDb();
  await db
    .insert(schema.featureFlags)
    .values({ key: "forms_v2", description: "Forms", state: "on" })
    .onConflictDoUpdate({ target: schema.featureFlags.key, set: { state: "on" } });
  const intro = await db.query.eventTypes.findFirst({
    where: eq(schema.eventTypes.slug, "intro-call"),
  });
  // A copy of the intro call, without its id and form, so this file edits its own.
  const [et] = await db
    .insert(schema.eventTypes)
    .values({
      ...intro!,
      id: undefined,
      formId: null,
      createdAt: undefined,
      slug: SLUG,
      title: `Forms ${run}`,
    })
    .returning({ id: schema.eventTypes.id });
  eventTypeId = et!.id;
  const [rf] = await db
    .insert(schema.routingForms)
    .values({
      workspaceId: intro!.workspaceId,
      slug: `route-${run}`,
      name: `Route ${run}`,
      fallback: { type: "message", text: "Thanks, we will be in touch." },
    })
    .returning({ id: schema.routingForms.id });
  routingId = rf!.id;
});

test.afterAll(async () => {
  await testDb()
    .update(schema.featureFlags)
    .set({ state: "off" })
    .where(eq(schema.featureFlags.key, "forms_v2"));
});

async function addQuestion(page: Page, type: string, label: string) {
  await page.getByRole("combobox", { name: "Type of question to add to page 1" }).click();
  await page.getByRole("option", { name: type, exact: true }).click();
  await page.getByRole("button", { name: "Add question" }).click();
  // The new question opens for editing; its text box is the one still empty.
  const box = page.getByRole("textbox", { name: "Question", exact: true }).last();
  await box.fill(label);
}

async function noAxeViolations(page: Page, what: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(r.violations, `${what}: ${JSON.stringify(r.violations, null, 2)}`).toEqual([]);
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/^Published as version \d+\.$/)).toBeVisible();
}

test.describe("form builder", () => {
  test.use({ storageState: STORAGE });

  test("an event type asks for a file only when the guest has one", async ({ page, browser }) => {
    await page.goto(`/admin/event-types/${eventTypeId}`);
    await page.getByRole("button", { name: "Edit questions" }).click();
    await expect(page.getByRole("heading", { name: "Booking questions" })).toBeVisible();

    await addQuestion(page, "Yes or no", "Do you have a brief?");
    await addQuestion(page, "File upload", "Your brief");
    await page.getByRole("button", { name: "Show only when…" }).last().click();
    await expect(page.getByRole("combobox", { name: "Condition 1: comparison" })).toHaveText(
      /is yes/,
    );
    // The preview follows the condition.
    const preview = page.getByRole("complementary", { name: "Preview" });
    await expect(preview.getByText("Your brief")).toHaveCount(0);
    await preview.getByRole("radio", { name: "Yes" }).check();
    await expect(preview.getByText("Your brief")).toBeVisible();
    await publish(page);
    await noAxeViolations(page, "the builder");

    // The guest: the file question appears on "yes", takes a PDF and is sent with the booking.
    const date = upcomingWeekday();
    await page.goto(`/demo/${SLUG}?tz=UTC&month=${date.slice(0, 7)}&date=${date}`);
    await page.locator('a[href*="slot="]').first().click();
    await page.getByLabel("Name", { exact: true }).fill("Brief Guest");
    await page.getByLabel("Email", { exact: true }).fill(`brief-${run}@example.com`);
    await page.getByLabel("What would you like to discuss?").fill("A new website");
    await expect(page.getByText("Your brief")).toHaveCount(0);
    await page.getByRole("radio", { name: "Yes" }).check();
    await noAxeViolations(page, "the booking form with a file question");
    await page.getByLabel(/Your brief/).setInputFiles({
      name: "brief.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await expect(page.getByRole("button", { name: "Remove brief.pdf" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();

    // The host sees the answer and the file, which always downloads.
    const db = testDb();
    const booking = await db.query.bookings.findFirst({
      where: eq(schema.bookings.attendeeEmail, `brief-${run}@example.com`),
    });
    expect(booking!.answers).toMatchObject({ q1_topic: "A new website" });
    await page.goto(`/admin/bookings/${booking!.id}`);
    const link = page.getByRole("link", { name: "brief.pdf" });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute("href"))!;
    const download = await page.request.get(href);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toMatch(/^attachment/);
    // Signed out, the file does not exist.
    const anonymous = await (await browser.newContext(SIGNED_OUT)).request.get(href);
    expect(anonymous.status()).toBe(404);

    const response = await db.query.formResponses.findFirst({
      where: and(
        eq(schema.formResponses.bookingId, booking!.id),
        eq(schema.formResponses.status, "submitted"),
      ),
    });
    expect(response!.resumeTokenHash).toBeNull();
    expect(Object.values(response!.answers)).toContainEqual({
      fileIds: [href.split("/").pop()],
    });
  });

  test("the upload endpoint refuses disguised, oversized and foreign files", async ({
    browser,
  }) => {
    const db = testDb();
    const et = await db.query.eventTypes.findFirst({
      where: eq(schema.eventTypes.id, eventTypeId),
    });
    test.skip(!et?.formId, "needs the first test's published form");
    const form = await db.query.forms.findFirst({ where: eq(schema.forms.id, et!.formId!) });
    const version = await db.query.formVersions.findFirst({
      where: eq(schema.formVersions.id, form!.publishedVersionId!),
    });
    const fieldId = version!.schema.fields.find((f) => f.type === "file")!.id;
    const api = (await browser.newContext(SIGNED_OUT)).request;
    const base = `/api/forms/${form!.id}/uploads`;
    const start = (body: object, token?: string) =>
      api.post(base, {
        data: { fieldId, name: "brief.pdf", mime: "application/pdf", size: 64, ...body },
        headers: token ? { "x-form-token": token } : {},
      });

    expect((await start({ size: 11 * 1024 ** 2 })).status()).toBe(400);
    expect((await start({ mime: "text/html", name: "brief.html" })).status()).toBe(400);

    // An HTML page announced as a PDF is caught by its first bytes and removed.
    const html = Buffer.from("<html><script>alert(1)</script></html>".padEnd(64, " "));
    const ticket = await (await start({ size: html.length })).json();
    expect(ticket.token).toBeTruthy();
    await api.put(ticket.upload.url, { data: html, headers: ticket.upload.headers });
    const done = await api.post(`${base}/${ticket.id}/complete`, {
      headers: { "x-form-token": ticket.token },
    });
    expect(done.status()).toBe(400);
    expect((await done.json()).error).toMatch(/not what its type says/);
    expect(
      await db.query.files.findFirst({ where: eq(schema.files.id, ticket.id) }),
    ).toBeUndefined();

    // Another draft's file is unknown without its token.
    const other = await (await start({ size: PDF.length })).json();
    const stranger = await api.post(`${base}/${other.id}/complete`);
    expect(stranger.status()).toBe(404);

    // The builder is not reachable signed out, and the API never opens it.
    const signedOut = await (await browser.newContext(SIGNED_OUT)).newPage();
    await signedOut.goto(`/admin/forms/${form!.id}`);
    await expect(signedOut).toHaveURL(/\/login/);
  });

  test("a routing form shows a question only for one answer", async ({ page }) => {
    await page.goto(`/admin/routing/${routingId}`);
    await page.getByRole("button", { name: "Edit questions" }).click();
    await expect(page.getByRole("heading", { name: "Routing questions" })).toBeVisible();

    await addQuestion(page, "Dropdown", "Team size");
    await page.getByRole("textbox", { name: /Options, one per line/ }).fill("1-10\n50+");
    await addQuestion(page, "Short answer", "Procurement contact");
    await page.getByRole("button", { name: "Show only when…" }).last().click();
    await page.getByRole("combobox", { name: "Condition 1: answer" }).click();
    await page.getByRole("option", { name: "50+", exact: true }).click();
    await publish(page);

    await page.goto(`/r/route-${run}`);
    await page.getByLabel("Name", { exact: true }).fill("Route Guest");
    await page.getByLabel("Email", { exact: true }).fill(`route-${run}@example.com`);
    await expect(page.getByLabel("Procurement contact")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Team size" }).click();
    await page.getByRole("option", { name: "50+", exact: true }).click();
    await page.getByLabel("Procurement contact").fill("buyer@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Thanks, we will be in touch.")).toBeVisible();

    const response = await testDb().query.formResponses.findFirst({
      where: eq(schema.formResponses.routingFormId, routingId),
    });
    expect(Object.values(response!.answers)).toEqual(
      expect.arrayContaining(["50+", "buyer@example.com"]),
    );
  });
});
