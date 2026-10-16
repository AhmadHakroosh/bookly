import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, or, schema, sql } from "@bookly/db";
import type {
  HostNotifications,
  Notification,
  NotificationKind,
  Workspace,
} from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { hasFlag } from "./flags";
import { notifyHost, type HostEvent } from "./notify";
import { pushToUser } from "./push";
import { adminBaseUrl } from "./urls";

/*
 * In-app and desktop notifications (0.15.0). Every event that concerns a member goes through
 * `notify()`: it writes the row the bell, the panel and the Home card read (the live stream
 * picks it up from there), sends Web Push to the member's browsers, emails when the member
 * wants that kind by email, and keeps the text / Slack pings of Admin → Notifications. Rows and
 * push are behind the `notifications` flag; email and texts behave as before when it is off.
 */

export type Channels = { inApp: boolean; desktop: boolean; email: boolean };

type KindInfo = {
  label: string;
  hint: string;
  defaults: Channels;
  /** The text / Slack toggle on the Notifications page this kind has always followed. */
  text?: HostEvent;
};

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
  },
  "booking.reminder": {
    label: "Starting soon",
    hint: "One hour before each meeting.",
    defaults: { inApp: false, desktop: true, email: true },
    text: "reminder1h",
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

/** Tells one member about one event on every channel they chose. Never throws. */
export async function notify(ws: Ws, userId: string, n: NotifyInput): Promise<void> {
  try {
    const [prefs, flagged] = await Promise.all([
      prefsOf(ws.id, userId),
      hasFlag(ws, "notifications"),
    ]);
    const ch = channelsFor(prefs, n.kind);
    const jobs: Promise<unknown>[] = [];
    if (flagged && (ch.inApp || ch.desktop)) {
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
      if (ch.desktop)
        jobs.push(
          pushToUser(ws.id, userId, {
            id: row.id,
            title: row.title,
            body: row.body,
            url: `${adminBaseUrl(ws)}${row.link ?? "/admin"}`,
          }),
        );
    }
    if (n.email && ch.email) jobs.push(emailMember(userId, n.email));
    const text = KINDS[n.kind].text;
    if (text)
      jobs.push(
        notifyHost(ws.id, userId, text, {
          text: n.text ?? [n.title, n.body].filter(Boolean).join(". "),
          bookingId: n.bookingId ?? undefined,
        }),
      );
    await Promise.all(jobs.map((j) => j.catch((e) => console.error("[notify]", n.kind, e))));
  } catch (e) {
    console.error("[notify] failed", n.kind, e);
  }
}

async function emailMember(userId: string, email: NonNullable<NotifyInput["email"]>) {
  const u = await db().query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true },
  });
  if (u?.email) await sendEmail({ to: u.email, ...email });
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
  const at = new Date(after.createdAt);
  return db()
    .select()
    .from(schema.notifications)
    .where(
      and(
        mine(workspaceId, userId),
        or(
          gt(schema.notifications.createdAt, at),
          and(eq(schema.notifications.createdAt, at), gt(schema.notifications.id, after.id)),
        ),
      ),
    )
    .orderBy(schema.notifications.createdAt, schema.notifications.id)
    .limit(limit);
}

/** Where a fresh stream starts: after the member's newest row (database time, not this server's clock). */
export async function streamStart(
  workspaceId: string,
  userId: string,
): Promise<NotificationCursor> {
  const { rows } = await listNotifications(workspaceId, userId, { limit: 1 });
  const n = rows[0];
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
    .set({ readAt: new Date() })
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
