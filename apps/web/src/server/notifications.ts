import "server-only";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  schema,
  sql,
} from "@bookly/db";
import type {
  DeliveryChannel,
  HostNotifications,
  Notification,
  NotificationFallback,
  NotificationKind,
  Workspace,
} from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { hasFlag } from "./flags";
import { notifyHost, type HostEvent } from "./notify";
import { pushToUser } from "./push";
import { channels, isConnected, publish } from "./realtime";
import { adminBaseUrl } from "./urls";

/*
 * In-app and desktop notifications (0.15.0), realtime first (ADR 0007). Every event that
 * concerns a member goes through `notify()`: it writes the row the bell, the panel and the Home
 * card read and announces it to the member's open tabs. The other channels the member chose
 * (Web Push, email, the text / Slack pings of Admin → Notifications) are the fallback: sent now
 * when the member has no Bookly tab open anywhere, otherwise held back for the kind's grace
 * period and sent only if no tab showed the notification by then. Rows and the live channel are
 * behind the `notifications` flag; with it off, email and texts go out as before.
 */

export type Channels = { inApp: boolean; desktop: boolean; email: boolean };

type KindInfo = {
  label: string;
  hint: string;
  defaults: Channels;
  /** The text / Slack toggle on the Notifications page this kind has always followed. */
  text?: HostEvent;
  /** Seconds a connected member has to see it before the other channels go out (default 300). */
  grace?: number;
};

export const DEFAULT_GRACE = 300;

export const KINDS: Record<NotificationKind, KindInfo> = {
  "booking.created": {
    label: "New booking",
    hint: "Someone booked time with you.",
    defaults: { inApp: true, desktop: true, email: true },
    text: "onBooking",
  },
  "booking.requested": {
    label: "Booking request",
    hint: "A booking waits for you to accept or decline it.",
    defaults: { inApp: true, desktop: true, email: true },
    text: "onBooking",
    grace: 120,
  },
  "booking.cancelled": {
    label: "Cancellation",
    hint: "A guest cancelled a booking or a series.",
    defaults: { inApp: true, desktop: true, email: true },
    text: "onCancel",
  },
  "guest.joined": {
    label: "Guest joined the call",
    hint: "Your guest is in the Bookly video room before you.",
    defaults: { inApp: true, desktop: true, email: true },
    text: "onJoin",
    grace: 60,
  },
  "booking.reminder": {
    label: "Starting soon",
    hint: "One hour before each meeting.",
    defaults: { inApp: false, desktop: true, email: true },
    text: "reminder1h",
    grace: 60,
  },
  "recap.ready": {
    label: "Recap ready",
    hint: "A recap or transcript is waiting for your review.",
    defaults: { inApp: true, desktop: true, email: true },
    text: "onBooking",
  },
  "payment.received": {
    label: "Payment received",
    hint: "A guest paid for a booking or a payment request.",
    defaults: { inApp: true, desktop: true, email: false },
  },
  "email.replied": {
    label: "Guest replied",
    hint: "A guest answered one of your emails (the email column forwards the reply to you).",
    defaults: { inApp: true, desktop: true, email: true },
  },
  "task.assigned": {
    label: "Task assigned to you",
    hint: "A teammate gave you a task.",
    defaults: { inApp: true, desktop: true, email: false },
  },
  "task.mentioned": {
    label: "Mentioned in a task",
    hint: "A teammate @-mentioned you in a task comment.",
    defaults: { inApp: true, desktop: true, email: false },
  },
  "message.posted": {
    label: "Team message",
    hint: "A teammate wrote in a team thread you are in, or added you to one.",
    defaults: { inApp: true, desktop: true, email: false },
  },
  "message.mentioned": {
    label: "Mentioned in Messages",
    hint: "A teammate @-mentioned you in a team thread or an internal note.",
    defaults: { inApp: true, desktop: true, email: true },
  },
  automation: {
    label: "Automations",
    hint: "An automation on a pipeline stage asks the team to look, or failed.",
    defaults: { inApp: true, desktop: true, email: false },
  },
  "application.submitted": {
    label: "Hiring applications",
    hint: "A new application, a withdrawal or a deletion request on an opportunity you coordinate.",
    defaults: { inApp: true, desktop: true, email: false },
  },
  "hiring.team": {
    label: "Hiring team",
    hint: "You were added to the team of an open opportunity.",
    defaults: { inApp: true, desktop: true, email: true },
  },
  "task.overdue": {
    label: "Task overdue",
    hint: "One of your tasks passed its due date.",
    defaults: { inApp: true, desktop: false, email: false },
    text: "reminder1h",
  },
};

export const KIND_KEYS = Object.keys(KINDS) as NotificationKind[];
export const isKind = (k: string): k is NotificationKind => k in KINDS;

/**
 * A member's channels for one kind. Saved choices win; otherwise the kind's defaults, except
 * the two emails that used to follow a text toggle keep doing so until the member chooses.
 */
export function channelsFor(prefs: HostNotifications, kind: NotificationKind): Channels {
  const d = { ...KINDS[kind].defaults };
  if (kind === "guest.joined") d.email = prefs.onJoin ?? true;
  if (kind === "task.overdue") d.email = prefs.reminder1h ?? false;
  const saved = prefs.kinds?.[kind] ?? {};
  return {
    inApp: saved.inApp ?? d.inApp,
    desktop: saved.desktop ?? d.desktop,
    email: saved.email ?? d.email,
  };
}

async function prefsOf(workspaceId: string, userId: string): Promise<HostNotifications> {
  const p = await db().query.profiles.findFirst({
    where: and(eq(schema.profiles.workspaceId, workspaceId), eq(schema.profiles.userId, userId)),
    columns: { notifications: true },
  });
  return p?.notifications ?? {};
}

/** Whether a member wants this kind by email (for the places that send their own, richer email). */
export async function wantsEmail(workspaceId: string, userId: string, kind: NotificationKind) {
  return channelsFor(await prefsOf(workspaceId, userId), kind).email;
}

export type NotifyInput = {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** Admin path the notification opens, e.g. `/admin/bookings/<id>`. */
  link?: string | null;
  /** Same key twice for the same member is a no-op (retried jobs, webhook redeliveries). */
  dedupeKey?: string | null;
  /** The booking it is about; the WhatsApp host-ping template's button opens it. */
  bookingId?: string | null;
  /** Text for SMS / WhatsApp / Slack; defaults to the title and body. */
  text?: string;
  /** Sent when the member wants this kind by email. Leave out where the caller emails itself. */
  email?: { subject: string; text: string; html?: string; replyTo?: string };
};

type Ws = Pick<Workspace, "id" | "slug" | "settings">;

/** Seconds a connected member has to see a notification of this kind before the fallback. */
export const graceFor = (kind: NotificationKind) => KINDS[kind].grace ?? DEFAULT_GRACE;

/** Drops the channels that are not wanted, so "nothing pending" is `null`. */
export function pendingOf(f: NotificationFallback): NotificationFallback | null {
  const out: NotificationFallback = {};
  if (f.push) out.push = true;
  if (f.email) out.email = f.email;
  if (f.text) out.text = f.text;
  if (!out.push && !out.email && !out.text) return null;
  if (f.seenOnly) out.seenOnly = true;
  return out;
}

/**
 * Whether a held-back notification still needs its fallback: not when a tab showed it, and not
 * when the member read it (unless it was listed as read from the start, a desktop-only kind).
 */
export const fallbackCancelled = (
  n: Pick<Notification, "seenAt" | "readAt">,
  f: NotificationFallback,
) => !!n.seenAt || (!f.seenOnly && !!n.readAt);

/**
 * Tells one member about one event, realtime first (ADR 0007): the bell row and the member's
 * open tabs right away; push, email and texts only if no tab is open, or after the kind's grace
 * period if no tab showed it. Never throws.
 */
export async function notify(ws: Ws, userId: string, n: NotifyInput): Promise<void> {
  try {
    const [prefs, flagged] = await Promise.all([
      prefsOf(ws.id, userId),
      hasFlag(ws, "notifications"),
    ]);
    const ch = channelsFor(prefs, n.kind);
    const textEvent = KINDS[n.kind].text;
    const wanted: NotificationFallback = {
      push: ch.desktop,
      email: n.email && ch.email ? n.email : undefined,
      text: textEvent
        ? {
            event: textEvent,
            text: n.text ?? [n.title, n.body].filter(Boolean).join(". "),
            bookingId: n.bookingId ?? undefined,
          }
        : undefined,
      // Desktop-only kinds are listed as read from the start: only being seen counts for them.
      seenOnly: !ch.inApp || undefined,
    };
    // Without the bell row there is no live surface: the other channels go out now.
    if (!flagged || !(ch.inApp || ch.desktop)) {
      await sendNow(ws, userId, null, { ...wanted, push: false });
      return;
    }
    const [row] = await db()
      .insert(schema.notifications)
      .values({
        workspaceId: ws.id,
        userId,
        kind: n.kind,
        title: n.title.slice(0, 200),
        body: n.body?.slice(0, 500) ?? null,
        link: n.link ?? null,
        dedupeKey: n.dedupeKey ?? null,
        // Desktop-only kinds are still listed (as read) so the panel tells the whole story.
        readAt: ch.inApp ? null : new Date(),
      })
      .onConflictDoNothing()
      .returning();
    // A conflict means this event was already announced: stop before pinging again.
    if (!row) return;
    const [live, unread] = await Promise.all([
      isConnected(ws.id, userId),
      unreadCount(ws.id, userId),
    ]);
    await publish([channels.member(ws.id, userId)], "notification", { ...toClient(row), unread });
    if (!live) {
      await sendNow(ws, userId, row, wanted);
      return;
    }
    const pending = pendingOf(wanted);
    const grace = graceFor(n.kind);
    await db()
      .update(schema.notifications)
      .set({
        delivery: { socket: new Date().toISOString() },
        ...(pending ? { fallback: pending, fallbackAt: new Date(Date.now() + grace * 1000) } : {}),
      })
      .where(eq(schema.notifications.id, row.id));
    if (pending) {
      const { enqueue } = await import("./jobs");
      await enqueue(
        "notifications.fallback",
        { id: row.id },
        { delaySeconds: grace, dedupeId: `fallback:${row.id}` },
      ).catch((e) => console.error("[notify] fallback not scheduled (the tick sends it)", e));
    }
  } catch (e) {
    console.error("[notify] failed", n.kind, e);
  }
}

/** Push, email and texts, now; records each channel used on the row. */
async function sendNow(
  ws: Ws,
  userId: string,
  row: Notification | null,
  f: NotificationFallback,
): Promise<void> {
  const used: DeliveryChannel[] = [];
  // A channel counts as used when something went out (a device, an address, a text or ping).
  const run = (channel: DeliveryChannel, p: Promise<unknown>) =>
    p.then(
      (n) => void (n !== 0 && n !== false && used.push(channel)),
      (e) => console.error("[notify]", row?.kind ?? "", channel, e),
    );
  const jobs: Promise<void>[] = [];
  if (row && f.push)
    jobs.push(
      run(
        "push",
        pushToUser(ws.id, userId, {
          id: row.id,
          title: row.title,
          body: row.body,
          url: `${adminBaseUrl(ws)}${row.link ?? "/admin"}`,
        }),
      ),
    );
  if (f.email) jobs.push(run("email", emailMember(userId, f.email)));
  if (f.text)
    jobs.push(
      run(
        "text",
        notifyHost(ws.id, userId, f.text.event as HostEvent, {
          text: f.text.text,
          bookingId: f.text.bookingId,
        }),
      ),
    );
  await Promise.all(jobs);
  if (!row || !used.length) return;
  const at = new Date().toISOString();
  await db()
    .update(schema.notifications)
    .set({
      delivery: sql`${schema.notifications.delivery} || ${JSON.stringify(Object.fromEntries(used.map((c) => [c, at])))}::jsonb`,
    })
    .where(eq(schema.notifications.id, row.id));
}

/**
 * The held-back channels of one notification, once its grace period is over (the
 * `notifications.fallback` job, or the tick). Claimed atomically, so a job and the tick never
 * both send. Returns whether anything went out.
 */
export async function sendFallback(id: string, now = new Date()): Promise<boolean> {
  const t = schema.notifications;
  const [row] = await db()
    .update(t)
    .set({ fallbackAt: null })
    .where(and(eq(t.id, id), lte(t.fallbackAt, now)))
    .returning();
  if (!row?.fallback) return false;
  const f = row.fallback;
  await db().update(t).set({ fallback: null }).where(eq(t.id, row.id));
  if (fallbackCancelled(row, f)) return false;
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, row.workspaceId),
  });
  if (!ws) return false;
  // Push only reaches a member with no tab open; a tab that is open shows it itself.
  const push = !!f.push && !(await isConnected(ws.id, row.userId));
  await sendNow(ws, row.userId, row, { ...f, push });
  return true;
}

/** Safety net for lost job messages and the inline driver: every fallback that is due. */
export async function sendDueFallbacks(now = new Date()): Promise<number> {
  const due = await db()
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(isNotNull(schema.notifications.fallbackAt), lte(schema.notifications.fallbackAt, now)),
    )
    .limit(200);
  let sent = 0;
  for (const { id } of due) if (await sendFallback(id, now)) sent++;
  return sent;
}

async function emailMember(userId: string, email: NonNullable<NotifyInput["email"]>) {
  const u = await db().query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true },
  });
  if (!u?.email) return false;
  await sendEmail({ to: u.email, ...email });
  return true;
}

/* ---------------- Reading ---------------- */

export type NotificationCursor = { createdAt: string; id: string };

export const encodeCursor = (n: Pick<Notification, "createdAt" | "id">) =>
  Buffer.from(`${n.createdAt.toISOString()}|${n.id}`).toString("base64url");

export function decodeCursor(s: unknown): NotificationCursor | null {
  if (typeof s !== "string" || !s) return null;
  try {
    const [createdAt, id] = Buffer.from(s, "base64url").toString().split("|");
    if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

const mine = (workspaceId: string, userId: string) =>
  and(eq(schema.notifications.workspaceId, workspaceId), eq(schema.notifications.userId, userId));

/** Newest first, one page at a time; the page after `cursor` costs the same however long the history. */
export async function listNotifications(
  workspaceId: string,
  userId: string,
  opts: { cursor?: NotificationCursor | null; limit?: number } = {},
): Promise<{ rows: Notification[]; next: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const conds = [mine(workspaceId, userId)];
  if (opts.cursor) {
    const at = new Date(opts.cursor.createdAt);
    conds.push(
      or(
        lt(schema.notifications.createdAt, at),
        and(eq(schema.notifications.createdAt, at), lt(schema.notifications.id, opts.cursor.id)),
      )!,
    );
  }
  const rows = await db()
    .select()
    .from(schema.notifications)
    .where(and(...conds))
    .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    rows: page,
    next: rows.length > limit ? encodeCursor(page[page.length - 1]!) : null,
  };
}

/** Rows after a cursor, oldest first: what the live stream sends next. */
export async function notificationsAfter(
  workspaceId: string,
  userId: string,
  after: NotificationCursor,
  limit = 20,
): Promise<Notification[]> {
  // Postgres keeps microseconds, a cursor (a JS date) only milliseconds: compare at millisecond
  // precision, or the row the cursor came from counts as "after" it and is sent again on every
  // reconnect (which showed the same desktop notification over and over).
  const ms = sql`date_trunc('milliseconds', ${schema.notifications.createdAt})`;
  const at = new Date(after.createdAt);
  return db()
    .select()
    .from(schema.notifications)
    .where(
      and(
        mine(workspaceId, userId),
        or(sql`${ms} > ${at}`, and(sql`${ms} = ${at}`, gt(schema.notifications.id, after.id))),
      ),
    )
    .orderBy(ms, schema.notifications.id)
    .limit(limit);
}

/** Where a fresh stream starts: after the member's newest row (database time, not this server's clock). */
export async function streamStart(
  workspaceId: string,
  userId: string,
): Promise<NotificationCursor> {
  // The newest row in the stream's own order (milliseconds, then id), so nothing that existed
  // before the stream opened is sent as new.
  const ms = sql`date_trunc('milliseconds', ${schema.notifications.createdAt})`;
  const [n] = await db()
    .select({ createdAt: schema.notifications.createdAt, id: schema.notifications.id })
    .from(schema.notifications)
    .where(mine(workspaceId, userId))
    .orderBy(desc(ms), desc(schema.notifications.id))
    .limit(1);
  return n
    ? { createdAt: n.createdAt.toISOString(), id: n.id }
    : { createdAt: new Date(0).toISOString(), id: "" };
}

export async function unreadCount(workspaceId: string, userId: string): Promise<number> {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(mine(workspaceId, userId), isNull(schema.notifications.readAt)));
  return r?.n ?? 0;
}

/** Marks some (or, without ids, all) of a member's notifications read. Returns how many changed. */
export async function markRead(workspaceId: string, userId: string, ids?: string[]) {
  if (ids && !ids.length) return 0;
  const rows = await db()
    .update(schema.notifications)
    .set({ readAt: new Date(), fallbackAt: null, fallback: null })
    .where(
      and(
        mine(workspaceId, userId),
        isNull(schema.notifications.readAt),
        ids ? inArray(schema.notifications.id, ids.slice(0, 200)) : undefined,
      ),
    )
    .returning({ id: schema.notifications.id });
  return rows.length;
}

/**
 * A tab showed these notifications (it was visible, or it raised a desktop notification): the
 * channels held back for them are not needed any more. Not the same as read: the dot stays.
 */
export async function markSeen(workspaceId: string, userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const rows = await db()
    .update(schema.notifications)
    .set({ seenAt: new Date(), fallbackAt: null, fallback: null })
    .where(
      and(
        mine(workspaceId, userId),
        isNull(schema.notifications.seenAt),
        inArray(schema.notifications.id, ids.slice(0, 200)),
      ),
    )
    .returning({ id: schema.notifications.id });
  return rows.length;
}

/** Notifications are a feed, not a record (the activity log is): keep 90 days. Called from the tick. */
export const RETENTION_DAYS = 90;

export async function pruneNotifications(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const rows = await db()
    .delete(schema.notifications)
    .where(lt(schema.notifications.createdAt, cutoff))
    .returning({ id: schema.notifications.id });
  return rows.length;
}

/** The fields the client needs, with dates as strings. */
export function toClient(n: Notification) {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    read: !!n.readAt,
    createdAt: n.createdAt.toISOString(),
  };
}
export type ClientNotification = ReturnType<typeof toClient>;
