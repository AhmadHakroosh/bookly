import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test";

/*
 * Realtime first (ADR 0007): `notify()` against a recording stand-in for the database, a fake
 * realtime driver and mocked email, push and texts. A connected member gets the socket message
 * and no email; a member with no tab open gets the email (and push) right away; a held-back
 * email goes out after the grace period only if no tab showed the notification.
 */

const sent = vi.hoisted(() => ({
  email: vi.fn<(m: { to: string; subject: string }) => Promise<object>>(async () => ({})),
  push: vi.fn(async () => 1),
  text: vi.fn(async () => {}),
  enqueue: vi.fn(async () => {}),
}));

vi.mock("@bookly/email", () => ({ sendEmail: sent.email }));
vi.mock("@/server/push", () => ({ pushToUser: sent.push }));
vi.mock("@/server/notify", () => ({ notifyHost: sent.text }));
vi.mock("@/server/jobs", () => ({ enqueue: sent.enqueue }));
vi.mock("@/server/flags", () => ({ hasFlag: async () => fake.flag }));

type Row = Record<string, unknown> & { id: string };

/** Just enough of Drizzle: every builder call is recorded; awaiting a chain gives its result. */
const fake = vi.hoisted(() => {
  const state = {
    flag: true,
    prefs: {} as Record<string, unknown>,
    row: null as Row | null,
    updates: [] as Record<string, unknown>[],
    claim: null as Row | null,
  };
  const chain = (result: () => unknown, onSet?: (v: Record<string, unknown>) => void) => {
    const target = () => {};
    const p: unknown = new Proxy(target, {
      get(_t, k) {
        if (k === "then")
          return (ok: (v: unknown) => void, bad: (e: unknown) => void) =>
            Promise.resolve().then(result).then(ok, bad);
        return (...args: unknown[]) => {
          if (k === "set" && onSet) onSet(args[0] as Record<string, unknown>);
          return p;
        };
      },
    });
    return p;
  };
  const db = {
    query: {
      profiles: { findFirst: async () => ({ notifications: state.prefs }) },
      users: { findFirst: async () => ({ email: "member@example.com" }) },
      workspaces: {
        findFirst: async () => ({ id: "ws1", slug: "acme", settings: {} }),
      },
    },
    insert: () => chain(() => (state.row ? [state.row] : [])),
    select: () => chain(() => [{ n: 1 }]),
    update: () => {
      let values: Record<string, unknown> = {};
      return chain(
        () => {
          state.updates.push(values);
          // The claim in `sendFallback` is the update that clears `fallbackAt`.
          return values.fallbackAt === null && state.claim ? [state.claim] : [];
        },
        (v) => (values = v),
      );
    },
    execute: async () => ({ rows: [] }),
  };
  return Object.assign(state, { db });
});
vi.mock("@/lib/db", () => ({ db: () => fake.db }));

import type { NotificationFallback } from "@bookly/db/schema";
import {
  KINDS,
  fallbackCancelled,
  graceFor,
  notify,
  pendingOf,
  sendFallback,
} from "@/server/notifications";
import { channels, setRealtimeDriver } from "@/server/realtime";

const ws = { id: "ws1", slug: "acme", settings: {} } as never;
const published: { to: string[]; event: string; data: unknown }[] = [];
let online = new Set<string>();

const mention = {
  kind: "message.mentioned" as const,
  title: "Lina mentioned you in “Launch”",
  body: "Can you check the deck?",
  link: "/admin/messages?thread=t1",
  dedupeKey: "thread-message:m1:u1",
  email: { subject: "Lina mentioned you", text: "Can you check the deck?" },
};

beforeEach(() => {
  vi.clearAllMocks();
  published.length = 0;
  online = new Set();
  fake.flag = true;
  fake.prefs = {};
  fake.updates = [];
  fake.claim = null;
  fake.row = {
    id: "n1",
    workspaceId: "ws1",
    userId: "u1",
    kind: "message.mentioned",
    title: mention.title,
    body: mention.body,
    link: mention.link,
    readAt: null,
    seenAt: null,
    createdAt: new Date(),
  };
  setRealtimeDriver({
    publish: async (to, event, data) => void published.push({ to, event, data }),
    connected: async (_ws, ids) => new Set(ids.filter((id) => online.has(id))),
  });
});

describe("notify(), realtime first", () => {
  it("a connected member gets the socket message and no email, push or text", async () => {
    online.add("u1");
    await notify(ws, "u1", mention);

    expect(published).toHaveLength(1);
    expect(published[0]!.to).toEqual([channels.member("ws1", "u1")]);
    expect(published[0]!.event).toBe("notification");
    expect(published[0]!.data).toMatchObject({ id: "n1", title: mention.title, unread: 1 });

    expect(sent.email).not.toHaveBeenCalled();
    expect(sent.push).not.toHaveBeenCalled();
    expect(sent.text).not.toHaveBeenCalled();

    // The email is held back on the row, due after the kind's grace period.
    const held = fake.updates.find((u) => u.fallback);
    expect(held?.fallback).toMatchObject({ push: true, email: mention.email });
    expect((held?.delivery as Record<string, string>).socket).toBeTruthy();
    const due = (held!.fallbackAt as Date).getTime() - Date.now();
    expect(due).toBeGreaterThan((graceFor("message.mentioned") - 5) * 1000);
    expect(sent.enqueue).toHaveBeenCalledWith(
      "notifications.fallback",
      { id: "n1" },
      { delaySeconds: graceFor("message.mentioned"), dedupeId: "fallback:n1" },
    );
  });

  it("a member with no tab open gets the email and the push right away", async () => {
    await notify(ws, "u1", mention);

    expect(sent.email).toHaveBeenCalledTimes(1);
    expect(sent.email.mock.calls[0]![0]).toMatchObject({
      to: "member@example.com",
      subject: mention.email.subject,
    });
    expect(sent.push).toHaveBeenCalledTimes(1);
    expect(sent.enqueue).not.toHaveBeenCalled();
    // Still published: a tab that is just connecting picks it up.
    expect(published.map((p) => p.event)).toEqual(["notification"]);
    // Each channel used is recorded on the row.
    expect(fake.updates.some((u) => String(u.delivery ?? "").length > 0)).toBe(true);
  });

  it("only the channels the member chose: no email for a kind they get in Bookly only", async () => {
    fake.prefs = { kinds: { "message.mentioned": { email: false, desktop: false } } };
    await notify(ws, "u1", mention);
    expect(sent.email).not.toHaveBeenCalled();
    expect(sent.push).not.toHaveBeenCalled();
  });

  it("with nothing a tab could show (email only), the email goes now even when connected", async () => {
    online.add("u1");
    fake.prefs = { kinds: { "message.mentioned": { inApp: false, desktop: false } } };
    await notify(ws, "u1", mention);
    expect(sent.email).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(0);
  });

  it("with the notifications flag off, email and texts go out as before", async () => {
    online.add("u1");
    fake.flag = false;
    await notify(ws, "u1", { ...mention, kind: "booking.created" });
    expect(sent.email).toHaveBeenCalledTimes(1);
    expect(sent.text).toHaveBeenCalledTimes(1);
    expect(sent.push).not.toHaveBeenCalled();
  });

  it("an event already announced (same dedupe key) sends nothing", async () => {
    fake.row = null;
    await notify(ws, "u1", mention);
    expect(published).toHaveLength(0);
    expect(sent.email).not.toHaveBeenCalled();
  });
});

describe("the held-back channels", () => {
  const held: NotificationFallback = { push: true, email: mention.email };

  it("are sent after the grace period when no tab showed the notification", async () => {
    fake.claim = { ...fake.row!, fallback: held };
    expect(await sendFallback("n1")).toBe(true);
    expect(sent.email).toHaveBeenCalledTimes(1);
    expect(sent.push).toHaveBeenCalledTimes(1);
  });

  it("are dropped when a tab showed it", async () => {
    fake.claim = { ...fake.row!, seenAt: new Date(), fallback: held };
    expect(await sendFallback("n1")).toBe(false);
    expect(sent.email).not.toHaveBeenCalled();
  });

  it("are dropped when the member read it", async () => {
    fake.claim = { ...fake.row!, readAt: new Date(), fallback: held };
    expect(await sendFallback("n1")).toBe(false);
    expect(sent.email).not.toHaveBeenCalled();
  });

  it("skip push while a tab is open (the tab shows it), still email", async () => {
    online.add("u1");
    fake.claim = { ...fake.row!, fallback: held };
    expect(await sendFallback("n1")).toBe(true);
    expect(sent.email).toHaveBeenCalledTimes(1);
    expect(sent.push).not.toHaveBeenCalled();
  });

  it("are sent once: a second claim (job and tick) finds nothing", async () => {
    expect(await sendFallback("n1")).toBe(false);
    expect(sent.email).not.toHaveBeenCalled();
  });
});

describe("policy helpers", () => {
  it("time-critical kinds have a shorter grace", () => {
    expect(graceFor("guest.joined")).toBe(60);
    expect(graceFor("booking.reminder")).toBe(60);
    expect(graceFor("booking.requested")).toBe(120);
    expect(graceFor("message.posted")).toBe(300);
    for (const k of Object.keys(KINDS) as (keyof typeof KINDS)[])
      expect(graceFor(k)).toBeLessThanOrEqual(300);
  });

  it("nothing pending is null", () => {
    expect(pendingOf({ push: false })).toBeNull();
    expect(pendingOf({ seenOnly: true })).toBeNull();
    expect(pendingOf({ push: true, seenOnly: true })).toEqual({ push: true, seenOnly: true });
  });

  it("a desktop-only kind (listed as read) is cancelled only by being seen", () => {
    const f = { push: true, seenOnly: true };
    expect(fallbackCancelled({ readAt: new Date(), seenAt: null }, f)).toBe(false);
    expect(fallbackCancelled({ readAt: new Date(), seenAt: new Date() }, f)).toBe(true);
    expect(fallbackCancelled({ readAt: new Date(), seenAt: null }, { push: true })).toBe(true);
  });
});
