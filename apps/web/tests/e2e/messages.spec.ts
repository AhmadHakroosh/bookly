import type { Server } from "node:http";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { bookFirstSlot, STORAGE } from "./helpers";
import { replyAddress, startFakeResend, svixHeaders } from "./resend-fake";

/*
 * Messages (0.19.0): a client's conversation is their emails in and out plus what they wrote
 * when booking; the team writes to them by email from here, their reply comes back through the
 * inbound webhook, internal notes stay inside; team threads are started, answered and closed.
 */

test.use({ storageState: STORAGE });

const run = Date.now().toString(36).slice(-5);
let resend: Server;
const received = new Map<string, unknown>();

test.beforeAll(async () => {
  resend = await startFakeResend(received);
});
test.afterAll(() => resend.close());

const pane = (page: Page) => page.locator('[data-slot="sheet-content"]');
const actionDone = (page: Page) =>
  page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
  );

test("a client's conversation: booking note, email out, reply in, internal note, unread", async ({
  page,
  request,
}) => {
  const name = `Msg Guest ${run}`;
  const email = `msg-guest-${run}@example.com`;
  await bookFirstSlot(page, { name, email }, { notes: "Could we talk about pricing?" });

  // Booking started the conversation: their note from the booking page is unread; the
  // confirmation after it (an automatic email) only moved it up.
  await page.goto("/admin/messages");
  await expect(page.getByRole("heading", { name: /^Messages/, level: 1 })).toBeVisible();
  const row = page.getByRole("list", { name: "Conversations" }).getByRole("link", {
    name: new RegExp(name),
  });
  await expect(row).toBeVisible();
  await expect(row).toContainText("(unread)");
  await expect(row).toContainText("Confirmation email for");
  await row.click();
  await expect(pane(page).getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(pane(page).getByText("Could we talk about pricing?")).toBeVisible();
  await expect(pane(page).getByText("When booking")).toBeVisible();
  // The confirmation is an automatic email: folded.
  await expect(pane(page).getByText("Automatic email").first()).toBeVisible();
  await expect(pane(page).getByText("Show email").first()).toBeVisible();

  // Writing to the guest sends an email that lands in the conversation and on the timeline.
  await page.waitForLoadState("networkidle");
  await pane(page)
    .getByRole("textbox", { name: "Your message" })
    .fill("Yes, pricing is on the agenda.");
  const sent = actionDone(page);
  await pane(page).getByRole("button", { name: "Send email" }).click();
  await sent;
  await expect(pane(page).getByText("Yes, pricing is on the agenda.")).toBeVisible();
  const ours = pane(page)
    .getByRole("listitem")
    .filter({ hasText: "Yes, pricing is on the agenda." });
  const entryId = new URL(
    (await ours.getByRole("link", { name: "On the timeline" }).getAttribute("href"))!,
    "http://x",
  ).searchParams.get("entry")!;

  // Close the conversation: with it open, a reply that arrives is read on the spot (it shows
  // live in the pane), so it would never count as unread.
  await page.goto("/admin/messages");
  await expect(row).not.toContainText("(unread)");

  // The guest answers that email: it comes in through the webhook and makes the thread unread.
  const emailId = `em_msg_${run}`;
  received.set(emailId, {
    object: "email",
    id: emailId,
    from: `${name} <${email}>`,
    to: [replyAddress(entryId)],
    subject: "Re: pricing",
    text: "Great, see you then!\n\nOn Sat, Oct 17, 2026 Demo Host wrote:\n> Yes, pricing is on the agenda.",
    html: null,
    message_id: `<msg-${run}@example.com>`,
    headers: {},
    attachments: [],
  });
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: emailId, from: email, to: [replyAddress(entryId)], subject: "Re: pricing" },
  });
  const res = await request.post("/api/webhooks/resend", {
    data: body,
    headers: svixHeaders(body),
  });
  expect(res.status(), await res.text()).toBe(200);
  // The open list hears about it live (realtime, ADR 0007): no reload.
  await expect(row).toContainText("(unread)", { timeout: 10_000 });

  await page.goto("/admin/messages?box=unread");
  await expect(row).toContainText("(unread)");
  await expect(
    page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: /^Messages/ }),
  ).toContainText(/\d+\s*unread/);
  await row.click();
  await expect(pane(page).getByText("Great, see you then!")).toBeVisible();
  // Opening it read it.
  await page.waitForLoadState("networkidle");
  await page.goto("/admin/messages");
  await expect(row).not.toContainText("(unread)");

  // An internal note stays inside: it shows here, marked as a note, and goes to nobody.
  await row.click();
  await page.waitForLoadState("networkidle");
  await pane(page).getByRole("tab", { name: "Internal note" }).click();
  await pane(page)
    .getByRole("textbox", { name: "Internal note" })
    .fill("They asked about pricing twice.");
  const noted = actionDone(page);
  await pane(page).getByRole("button", { name: "Add note" }).click();
  await noted;
  const note = pane(page)
    .getByRole("listitem")
    .filter({ hasText: "They asked about pricing twice." });
  await expect(note).toContainText("Internal note");

  // The contact's page opens the same conversation.
  await page.goto("/admin/contacts");
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Open in Messages" }).click();
  await expect(pane(page).getByRole("heading", { name, level: 1 })).toBeVisible();
});

test("team threads: start one, post, close and reopen", async ({ page }) => {
  const subject = `Launch plan ${run}`;
  await page.goto("/admin/messages");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New message" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Team thread" }).click();
  await dialog.getByRole("textbox", { name: "Subject" }).fill(subject);
  await dialog.getByRole("textbox", { name: "Message" }).fill("Kick-off notes go here.");
  await dialog.getByRole("button", { name: "Start thread" }).click();
  await expect(pane(page).getByRole("heading", { name: subject, level: 1 })).toBeVisible();
  await expect(pane(page).getByText("Kick-off notes go here.")).toBeVisible();

  await page.waitForLoadState("networkidle");
  await pane(page)
    .getByRole("textbox", { name: "Your message" })
    .fill("Second thought: ship Monday.");
  const posted = actionDone(page);
  await pane(page).getByRole("button", { name: "Post" }).click();
  await posted;
  await expect(pane(page).getByText("Second thought: ship Monday.")).toBeVisible();

  // The conversation pane has no accessibility violations.
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);

  // Closing takes it out of the inbox; it waits under Closed and comes back on reopening.
  const closed = actionDone(page);
  await pane(page).getByRole("button", { name: "Close thread" }).click();
  await closed;
  await page.goto("/admin/messages");
  const list = page.getByRole("main");
  await expect(list.getByRole("link", { name: new RegExp(subject) })).toHaveCount(0);
  await page.goto("/admin/messages?box=closed");
  await list.getByRole("link", { name: new RegExp(subject) }).click();
  await page.waitForLoadState("networkidle");
  const reopened = actionDone(page);
  await pane(page).getByRole("button", { name: "Reopen thread" }).click();
  await reopened;
  await page.goto("/admin/messages");
  await expect(list.getByRole("link", { name: new RegExp(subject) })).toBeVisible();
});
