import { expect, test } from "@playwright/test";
import { makePastVideoCall } from "./db";
import { bookFirstSlot, STORAGE } from "./helpers";

/*
 * In-meeting notes (0.20.0). The call itself needs Daily, so the test turns a booking into a
 * finished Bookly video call and exercises what the in-call panel uses (the notes API) and the
 * booking page's notes, then the tick that posts them to the contact's timeline.
 */

test.use({ storageState: STORAGE });

const run = Date.now().toString(36).slice(-5);

test("notes from the call: saved privately, edited on the booking, posted to the timeline", async ({
  browser,
  page,
  request,
}) => {
  const email = `notes-guest-${run}@example.com`;
  await bookFirstSlot(page, { name: `Notes Guest ${run}`, email });
  const room = `b-e2e${run}`;
  const bookingId = await makePastVideoCall(email, room);

  // What the in-call panel does: save (the whole list) and load.
  const at = new Date(Date.now() - 40 * 60_000).toISOString();
  const saved = await page.request.put(`/api/meet/${room}/notes`, {
    data: {
      entries: [
        { id: "n1", at, text: "Send the proposal by Friday" },
        { id: "n2", at, text: "", moment: true },
        { id: "bad", at: "nope", text: "dropped" },
      ],
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  expect(await saved.json()).toMatchObject({ ok: true, count: 2 });
  const loaded = await (await page.request.get(`/api/meet/${room}/notes`)).json();
  expect(loaded.entries.map((e: { text: string }) => e.text)).toEqual([
    "Send the proposal by Friday",
    "",
  ]);

  // Private: nobody signed out (or outside the workspace) reads or writes them.
  const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await stranger.request.get(`/api/meet/${room}/notes`)).status()).toBe(404);
  expect(
    (await stranger.request.put(`/api/meet/${room}/notes`, { data: { entries: [] } })).status(),
  ).toBe(404);
  await stranger.close();

  // The booking page shows them, still editable after the call.
  await page.goto(`/admin/bookings/${bookingId}`);
  const notes = page.getByRole("region", { name: "Your notes from the call" });
  await expect(notes.getByRole("textbox", { name: /^Note at/ })).toHaveValue(
    "Send the proposal by Friday",
  );
  await expect(notes.getByLabel("Marked moment", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await notes.getByRole("textbox", { name: "New note" }).fill("They asked for SSO");
  const put = page.waitForResponse(
    (r) => r.url().endsWith(`/api/meet/${room}/notes`) && r.request().method() === "PUT",
  );
  await notes.getByRole("textbox", { name: "New note" }).press("Enter");
  expect((await put).status()).toBe(200);
  await expect(notes.getByText("Saved")).toBeVisible();
  await page.reload();
  await expect(notes.getByRole("textbox", { name: /^Note at/ }).last()).toHaveValue(
    "They asked for SSO",
  );

  // The tick posts them to the contact's timeline once the meeting is over.
  const secret = process.env.CRON_SECRET;
  test.skip(!secret, "CRON_SECRET is not set: the tick cannot be called");
  const tick = await request.get("/api/cron/tick", {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect(tick.status(), await tick.text()).toBe(200);
  await page.goto("/admin/contacts");
  await page
    .getByRole("link", { name: new RegExp(`Notes Guest ${run}`) })
    .first()
    .click();
  await expect(page.getByText(/^Notes from the call by /).first()).toBeVisible();
  await expect(page.getByText(/Send the proposal by Friday/).first()).toBeVisible();
  await expect(page.getByText(/⚑ Marked moment/).first()).toBeVisible();
});
