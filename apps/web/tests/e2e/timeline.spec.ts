import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { bookFirstSlot, STORAGE } from "./helpers";

/*
 * The contact timeline v2 with a guest reply end to end: a booking's confirmation is on the
 * timeline, a reply to its signed Reply-To address arrives through Resend's (signed) webhook,
 * Bookly fetches the message from a stand-in for Resend's API, and the reply shows under the
 * confirmation with the quoted history cut off; the host answers from the timeline.
 */

const WEBHOOK_SECRET = Buffer.from("e2e-webhook-secret-0123456789");
const DOMAIN = "reply.bookly.test";

/** The address Bookly put on the email logged as entry `id` (same recipe as server/inbound.ts). */
function replyAddress(id: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set for this test (the server signs with it)");
  const sig = createHmac("sha256", secret).update(`reply:${id}`).digest("hex").slice(0, 16);
  return `r-${id.replace(/-/g, "")}-${sig}@${DOMAIN}`;
}

function svixHeaders(body: string) {
  const id = `msg_${Date.now()}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${id}.${ts}.${body}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": `v1,${sig}`,
    "content-type": "application/json",
  };
}

let resend: Server;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const received = new Map<string, unknown>();

test.beforeAll(async () => {
  resend = createServer((req, res) => {
    const parts = (req.url ?? "").split("?")[0]!.split("/").filter(Boolean).map(decodeURIComponent);
    // GET /dl/<attachment id>: the bytes behind a download_url.
    if (parts[0] === "dl") {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end(PDF);
    }
    // GET /emails/receiving/<id>/attachments: each attachment with a download_url.
    if (parts.at(-1) === "attachments") {
      const email = received.get(parts.at(-2)!) as { attachments?: { id: string }[] } | undefined;
      res.writeHead(email ? 200 : 404, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          object: "list",
          has_more: false,
          data: (email?.attachments ?? []).map((a) => ({
            ...a,
            download_url: `http://localhost:3999/dl/${a.id}`,
          })),
        }),
      );
    }
    const email = received.get(parts.at(-1)!);
    res.writeHead(email ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(email ?? { error: "not found" }));
  });
  await new Promise<void>((r) => resend.listen(3999, r));
});
test.afterAll(() => resend.close());

test("a guest's reply lands under the email it answers, and the host answers from the timeline", async ({
  browser,
  page,
  request,
}) => {
  await bookFirstSlot(page, { name: "Reply Guest", email: "reply-guest@example.com" });
  const admin = await (await browser.newContext({ storageState: STORAGE })).newPage();
  await admin.goto("/admin/contacts");
  await admin
    .getByRole("link", { name: /Reply Guest/ })
    .first()
    .click();
  await expect(admin.getByRole("heading", { name: "Timeline" })).toBeVisible();

  // Day groups, and the confirmation with its content in an accordion.
  await expect(admin.getByRole("heading", { name: "Today", level: 3 })).toBeVisible();
  const confirmation = admin.getByRole("link", { name: /^Confirmation email for/ }).first();
  await expect(confirmation).toBeVisible();
  const entryId = new URL(
    (await confirmation.getAttribute("href")) ?? "",
    "http://x",
  ).searchParams.get("entry")!;
  await admin.getByText("Show email").first().click();
  await expect(admin.getByText(/Reply Guest/).first()).toBeVisible();

  // The guest replies; Resend calls the webhook.
  const emailId = `em_${Date.now()}`;
  received.set(emailId, {
    object: "email",
    id: emailId,
    from: "Reply Guest <reply-guest@example.com>",
    to: [replyAddress(entryId)],
    subject: "Re: Confirmed",
    text: "Looking forward to it! Can we also cover pricing?\n\nOn Fri, Oct 16, 2026 at 10:00 Demo Host wrote:\n> Your booking is confirmed.",
    html: null,
    message_id: "<guest-1@example.com>",
    headers: {},
    attachments: [
      {
        id: "a1",
        filename: "agenda.pdf",
        content_type: "application/pdf",
        content_disposition: "attachment",
        size: PDF.length,
      },
      // A signature image sent inline: never kept.
      {
        id: "a2",
        filename: "logo.png",
        content_type: "image/png",
        content_disposition: "inline",
        size: 900,
      },
    ],
  });
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      email_id: emailId,
      from: "reply-guest@example.com",
      to: [replyAddress(entryId)],
      subject: "Re: Confirmed",
    },
  });
  const res = await request.post("/api/webhooks/resend", {
    data: body,
    headers: svixHeaders(body),
  });
  expect(res.status(), await res.text()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });

  // Same delivery again is a no-op; a bad signature is refused.
  const again = await request.post("/api/webhooks/resend", {
    data: body,
    headers: svixHeaders(body),
  });
  expect(await again.json()).toMatchObject({ ignored: "already received" });
  const forged = await request.post("/api/webhooks/resend", {
    data: body,
    headers: { ...svixHeaders(body), "svix-signature": "v1,AAAA" },
  });
  expect(forged.status()).toBe(401);

  await admin.reload();
  const replies = admin.getByRole("list", { name: "Replies" }).first();
  await expect(replies).toContainText("Looking forward to it! Can we also cover pricing?");
  await expect(replies).not.toContainText("Your booking is confirmed");
  // The attachment was kept: a link to the file, and it is in the contact's folder; the inline
  // signature image was skipped.
  const attachments = replies.getByRole("list", { name: "Attachments" });
  await expect(attachments.getByRole("link", { name: "agenda.pdf" })).toBeVisible();
  await expect(attachments).not.toContainText("logo.png");
  await expect(admin.getByRole("region", { name: "Files" })).toContainText("agenda.pdf");

  // A kept PDF opens in the viewer, with a way out to a new tab.
  await admin.waitForLoadState("networkidle");
  await attachments.getByRole("link", { name: "agenda.pdf" }).click();
  const viewer = admin.locator('[data-slot="dialog-content"]');
  await expect(viewer.getByRole("heading", { name: "agenda.pdf" })).toBeVisible();
  await expect(viewer.locator('iframe[title="agenda.pdf"]')).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Open in new tab" })).toHaveAttribute(
    "href",
    /^\/files\/[0-9a-f-]+$/,
  );
  await admin.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  // The host answers from the timeline; the answer joins the thread.
  await admin.waitForLoadState("networkidle");
  await admin.getByRole("button", { name: "Reply" }).first().click();
  await admin.getByRole("textbox", { name: "Your reply" }).fill("Yes, pricing is on the agenda.");
  const sent = admin.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
  );
  await admin.getByRole("button", { name: "Send reply" }).click();
  await sent;
  await expect(admin.getByRole("list", { name: "Replies" }).first()).toContainText(
    "Yes, pricing is on the agenda.",
  );

  // Settings → Emails shows where replies go; switching it off hides Reply on the timeline, and a
  // reply to an email sent while it was on still arrives.
  const contactUrl = new URL(admin.url()).pathname;
  await admin.goto("/admin/settings/emails");
  const section = admin.getByRole("region", { name: "Guest replies" });
  await expect(section.getByRole("status").first()).toContainText(
    "land on each contact's timeline",
  );
  await section.getByRole("button", { name: "Turn off" }).click();
  await expect(section.getByRole("status").first()).toContainText("sender's own address");
  const laterId = `em_${Date.now()}_2`;
  received.set(laterId, {
    ...(received.get(emailId) as object),
    id: laterId,
    text: "One more thing: send the agenda?",
    message_id: "<guest-2@example.com>",
    attachments: [],
  });
  const laterBody = JSON.stringify({
    type: "email.received",
    data: { email_id: laterId, from: "reply-guest@example.com", to: [replyAddress(entryId)] },
  });
  const later = await request.post("/api/webhooks/resend", {
    data: laterBody,
    headers: svixHeaders(laterBody),
  });
  expect(await later.json()).toMatchObject({ ok: true });
  await admin.goto(contactUrl);
  await expect(admin.getByRole("list", { name: "Replies" }).first()).toContainText(
    "send the agenda?",
  );
  await expect(admin.getByRole("button", { name: "Reply" })).toHaveCount(0);
  await admin.goto("/admin/settings/emails");
  await admin
    .getByRole("region", { name: "Guest replies" })
    .getByRole("button", { name: "Turn on" })
    .click();
  await expect(
    admin.getByRole("region", { name: "Guest replies" }).getByRole("status").first(),
  ).toContainText("timeline");
  await admin.goto(contactUrl);

  // The timeline, with a thread and the reply box closed, has no accessibility violations.
  await admin.reload();
  await admin.waitForLoadState("networkidle");
  const axe = await new AxeBuilder({ page: admin })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);

  // The side pane shows the whole thread, quoted text included on request.
  await admin.goto(`${new URL(admin.url()).pathname}?entry=${entryId}`);
  const pane = admin.locator('[data-slot="sheet-content"]');
  await expect(
    pane.getByText("From Reply Guest <reply-guest@example.com>", { exact: false }).first(),
  ).toBeVisible();
  await pane.getByText("Show the quoted text").first().click();
  await expect(pane.getByText(/Your booking is confirmed/)).toBeVisible();
  // Its attachments are listed as they are: the kept one links to the file.
  await expect(pane.getByRole("link", { name: "agenda.pdf" })).toBeVisible();
  await expect(pane).not.toContainText("not kept");
});
