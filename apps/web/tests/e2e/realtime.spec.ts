import type { Server } from "node:http";
import { expect, test, type APIRequestContext, type Page, type WebSocket } from "@playwright/test";
import { and, desc, eq, schema } from "@bookly/db";
import { testDb } from "./db";
import { DEMO, STORAGE, bookFirstSlot } from "./helpers";
import { replyAddress, startFakeResend, svixHeaders } from "./resend-fake";

/*
 * Realtime first (ADR 0007). The bell connects over a websocket at the app's own /realtime (the
 * Next server proxies the upgrade to the in-process socket server: undocumented, so this spec
 * guards it). A member with Bookly open gets a guest's reply on the socket and no email; with
 * every tab closed, the next reply is emailed.
 */

test.use({ storageState: STORAGE });

const run = Date.now().toString(36).slice(-5);
let resend: Server;
const received = new Map<string, unknown>();

test.beforeAll(async () => {
  resend = await startFakeResend(received);
});
test.afterAll(() => resend.close());

const bellOf = (page: Page) => page.getByRole("button", { name: /^Notifications/ });

/** Opens Admin and waits for the bell's socket; returns it to watch the frames. */
async function openAdmin(page: Page): Promise<{ socket: WebSocket; frames: string[] }> {
  const socket = page.waitForEvent("websocket", (ws) => /\/realtime\?ticket=/.test(ws.url()));
  await page.goto("/admin");
  const ws = await socket;
  const frames: string[] = [];
  ws.on("framereceived", (f) => frames.push(String(f.payload)));
  await expect(bellOf(page)).toHaveAttribute("data-live", "socket", { timeout: 15_000 });
  return { socket: ws, frames };
}

const demoUser = async () => {
  const [u] = await testDb()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, DEMO.email))
    .limit(1);
  return u!.id;
};

const presence = async (userId: string) =>
  (
    await testDb()
      .select({ id: schema.realtimeConnections.id })
      .from(schema.realtimeConnections)
      .where(eq(schema.realtimeConnections.userId, userId))
  ).length;

/** The guest answers the confirmation email: the reply comes in through Resend's webhook. */
async function guestReplies(request: APIRequestContext, guest: string, n: number) {
  const ce = schema.contactEvents;
  const [entry] = await testDb()
    .select({ id: ce.id })
    .from(ce)
    .innerJoin(schema.contacts, eq(schema.contacts.id, ce.contactId))
    .where(and(eq(schema.contacts.email, guest), eq(ce.type, "email_sent")))
    .orderBy(desc(ce.createdAt))
    .limit(1);
  const emailId = `em_rt_${run}_${n}`;
  received.set(emailId, {
    object: "email",
    id: emailId,
    from: `Realtime Guest <${guest}>`,
    to: [replyAddress(entry!.id)],
    subject: `Re: our call (${n})`,
    text: `Reply number ${n}.`,
    html: null,
    message_id: `<rt-${run}-${n}@example.com>`,
    headers: {},
    attachments: [],
  });
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: emailId, from: guest, to: [replyAddress(entry!.id)], subject: "Re" },
  });
  const res = await request.post("/api/webhooks/resend", {
    data: body,
    headers: svixHeaders(body),
  });
  expect(res.status(), await res.text()).toBe(200);
  return `reply:${emailId}`;
}

const notificationBy = async (dedupeKey: string) => {
  const [n] = await testDb()
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.dedupeKey, dedupeKey))
    .limit(1);
  return n ?? null;
};

test("the bell connects over the websocket at /realtime, with presence", async ({ page }) => {
  const userId = await demoUser();
  const { socket } = await openAdmin(page);
  expect(new URL(socket.url()).pathname).toBe("/realtime");
  await expect.poll(() => presence(userId)).toBeGreaterThan(0);
});

test("a connected member gets the reply on the socket and no email; with no tab open, the email", async ({
  page,
  browser,
  request,
}) => {
  const userId = await demoUser();
  const guest = `rt-guest-${run}@example.com`;
  const booker = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await bookFirstSlot(await booker.newPage(), { name: "Realtime Guest", email: guest });
  await booker.close();

  // Bookly is open: the reply arrives on the socket and rings the bell.
  const { frames } = await openAdmin(page);
  const first = await guestReplies(request, guest, 1);
  await expect
    .poll(() => frames.some((f) => f.includes('"e":"notification"') && f.includes("replied")))
    .toBe(true);
  await expect(bellOf(page)).toHaveAccessibleName(/unread/);
  const live = await notificationBy(first);
  expect(live?.delivery.socket).toBeTruthy();
  expect(live?.delivery.email).toBeUndefined();
  // The tab was visible, so it reported the notification seen: the held-back email is cancelled.
  await expect
    .poll(async () => {
      const n = await notificationBy(first);
      return !!n?.seenAt && n.fallbackAt === null && n.fallback === null;
    })
    .toBe(true);
  expect((await notificationBy(first))?.delivery.email).toBeUndefined();

  // Every tab closed: no presence, so the next reply is emailed right away.
  await page.close();
  await expect.poll(() => presence(userId), { timeout: 15_000 }).toBe(0);
  const second = await guestReplies(request, guest, 2);
  await expect
    .poll(async () => (await notificationBy(second))?.delivery.email ?? null)
    .toBeTruthy();
  const away = await notificationBy(second);
  expect(away?.delivery.socket).toBeUndefined();
  expect(away?.fallbackAt).toBeNull();
});
