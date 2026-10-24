import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, schema } from "@bookly/db";
import type { ContactEvent } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { contactEventsVisibleTo } from "./access/hiring";
import { addDays, todayIn, utcToZoned, zonedToUtc } from "@/lib/time";

/*
 * The contact timeline v2 (0.17.0). A page is a window of about WINDOW entries, newest first,
 * that never splits a day: the window grows to the end of the day its last entry is on. The
 * query is keyset-paginated on (created_at, id) over the covering index
 * contact_events (contact_id, created_at, id), so the thousandth page costs what the first does.
 * Replies hang under the email they answer (parent_id) and come with the window they belong to.
 */

export const WINDOW = 30;
/** The most replies one thread shows inline; the side pane has them all. */
const THREAD_CAP = 50;

export type TimelineCursor = { createdAt: string; id: string };

export const encodeTimelineCursor = (e: Pick<ContactEvent, "createdAt" | "id">) =>
  Buffer.from(`${e.createdAt.toISOString()}|${e.id}`).toString("base64url");

export function decodeTimelineCursor(s: unknown): TimelineCursor | null {
  if (typeof s !== "string" || !s) return null;
  const [createdAt, id] = Buffer.from(s, "base64url").toString().split("|");
  return createdAt && id && !Number.isNaN(Date.parse(createdAt)) ? { createdAt, id } : null;
}

/** What the client needs of one entry (dates as strings, only the data fields it shows). */
export type TimelineItem = {
  id: string;
  type: ContactEvent["type"];
  summary: string;
  at: string;
  /** "10:42" in the viewer's timezone. */
  time: string;
  bookingId: string | null;
  subject: string | null;
  body: string | null;
  from: string | null;
  /** With `fileId` when the file was kept (Files), `reason` when it was not. */
  attachments: FileRef[];
  /** "file" entries: the file and the task it was added to. */
  file: { id: string; taskId: string | null; name: string; mime: string | null } | null;
  answers: Record<string, string> | null;
  /** Meeting entries: the booking with links to its recap and transcript. */
  meeting: { title: string; status: string; recap: boolean; transcript: boolean } | null;
  replies: TimelineItem[];
};

/** An email attachment on an entry; `mime` is the kept file's stored type, for the viewer. */
export type FileRef = {
  filename: string;
  fileId: string | null;
  reason: string | null;
  mime: string | null;
};

/** The attachments recorded on an email entry's data. */
export function attachmentsOf(data: unknown): FileRef[] {
  const list = (data as { attachments?: unknown } | null)?.attachments;
  if (!Array.isArray(list)) return [];
  return (list as { filename?: string; fileId?: string | null; reason?: string | null }[]).map(
    (a) => ({
      filename: a.filename ?? "attachment",
      fileId: a.fileId ?? null,
      reason: a.reason ?? null,
      mime: null,
    }),
  );
}

/**
 * Fills in the stored type of every file the entries point at, so the viewer knows what it can
 * show; a file deleted since then loses its link.
 */
export async function addFileTypes(
  workspaceId: string,
  items: Pick<TimelineItem, "attachments" | "file">[],
) {
  const ids = items.flatMap((it) => [
    ...it.attachments.flatMap((a) => (a.fileId ? [a.fileId] : [])),
    ...(it.file ? [it.file.id] : []),
  ]);
  if (!ids.length) return;
  const { fileTypes } = await import("./drive");
  const found = await fileTypes(workspaceId, ids);
  for (const it of items) {
    for (const a of it.attachments) {
      if (!a.fileId) continue;
      const f = found.get(a.fileId);
      if (f) a.mime = f.mime;
      else Object.assign(a, { fileId: null, reason: "deleted" });
    }
    if (it.file) {
      const f = found.get(it.file.id);
      it.file = f ? { ...it.file, ...f } : null;
    }
  }
}

export type TimelineDay = { day: string; label: string; items: TimelineItem[] };

const MEETING_TYPES = new Set([
  "booked",
  "confirmed",
  "cancelled",
  "rescheduled",
  "completed",
  "no_show",
  "capture",
  "brief",
]);

/** "Today", "Yesterday", or "Friday, October 16, 2026" for a viewer's day. */
export function dayLabel(day: string, tz: string, now = new Date()) {
  const today = todayIn(tz, now);
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const before = (c: TimelineCursor) =>
  or(
    lt(schema.contactEvents.createdAt, new Date(c.createdAt)),
    and(
      eq(schema.contactEvents.createdAt, new Date(c.createdAt)),
      lt(schema.contactEvents.id, c.id),
    ),
  )!;

/**
 * One window of a contact's timeline, newest first, grouped by the viewer's day. `next` is the
 * cursor for the window before it (null at the very first entry).
 */
export async function timelineWindow(
  workspaceId: string,
  contactId: string,
  tz: string,
  cursor: TimelineCursor | null = null,
  size = WINDOW,
  /** Who is looking: hiring entries only with their application (ADR 0005). */
  viewer: string | null = null,
): Promise<{ days: TimelineDay[]; next: string | null }> {
  const mine = and(
    eq(schema.contactEvents.workspaceId, workspaceId),
    eq(schema.contactEvents.contactId, contactId),
    isNull(schema.contactEvents.parentId),
    contactEventsVisibleTo(viewer),
  );
  const order = [desc(schema.contactEvents.createdAt), desc(schema.contactEvents.id)];
  const top = await db()
    .select()
    .from(schema.contactEvents)
    .where(cursor ? and(mine, before(cursor)) : mine)
    .orderBy(...order)
    .limit(size + 1);
  let rows = top.slice(0, size);
  if (top.length > size) {
    // Finish the day the window ends on, so no day is split between two pages.
    const last = rows[rows.length - 1]!;
    const dayStart = zonedToUtc(utcToZoned(last.createdAt, tz).date, 0, tz);
    const rest = await db()
      .select()
      .from(schema.contactEvents)
      .where(
        and(
          mine,
          before({ createdAt: last.createdAt.toISOString(), id: last.id }),
          gte(schema.contactEvents.createdAt, dayStart),
        ),
      )
      .orderBy(...order)
      // A day with more than this many entries is the one case a page may end mid-day.
      .limit(200);
    rows = [...rows, ...rest];
  }
  const last = rows[rows.length - 1];
  const more = last
    ? await db()
        .select({ id: schema.contactEvents.id })
        .from(schema.contactEvents)
        .where(and(mine, before({ createdAt: last.createdAt.toISOString(), id: last.id })))
        .limit(1)
    : [];
  const items = await enrich(rows, tz);
  const days: TimelineDay[] = [];
  for (const it of items) {
    const day = utcToZoned(new Date(it.at), tz).date;
    const group = days[days.length - 1];
    if (group?.day === day) group.items.push(it);
    else days.push({ day, label: dayLabel(day, tz), items: [it] });
  }
  return { days, next: more.length && last ? encodeTimelineCursor(last) : null };
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
/** Email text as people read it: no runs of blank lines, no trailing spaces. */
export const tidy = (t: string | null) =>
  t
    ? t
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : null;
/** "Lina Farah <lina@x.com>" → "Lina Farah"; a bare address stays as it is. */
export const displayName = (from: string | null) =>
  from ? (from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)?.[1] ?? from).trim() : null;

function shape(e: ContactEvent, tz: string): TimelineItem {
  const d = e.data as Record<string, unknown>;
  const { minutes } = utcToZoned(e.createdAt, tz);
  return {
    id: e.id,
    type: e.type,
    summary: e.summary,
    at: e.createdAt.toISOString(),
    time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    bookingId: e.bookingId,
    subject: str(d.subject),
    body: tidy(str(d.body)),
    from: displayName(str(d.from)),
    attachments: attachmentsOf(d),
    file:
      e.type === "file" && str(d.fileId)
        ? { id: str(d.fileId)!, taskId: str(d.taskId), name: str(d.name) ?? "file", mime: null }
        : null,
    answers:
      d.answers && typeof d.answers === "object" && Object.keys(d.answers).length
        ? (d.answers as Record<string, string>)
        : null,
    meeting: null,
    replies: [],
  };
}

/** Adds each entry's replies and, for meetings, the booking with its recap and transcript. */
async function enrich(rows: ContactEvent[], tz: string): Promise<TimelineItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const bookingIds = [
    ...new Set(
      rows.filter((r) => r.bookingId && MEETING_TYPES.has(r.type)).map((r) => r.bookingId!),
    ),
  ];
  const [replies, bookings, recaps, transcripts] = await Promise.all([
    db()
      .select()
      .from(schema.contactEvents)
      .where(inArray(schema.contactEvents.parentId, ids))
      .orderBy(asc(schema.contactEvents.createdAt), asc(schema.contactEvents.id))
      .limit(ids.length * THREAD_CAP),
    bookingIds.length
      ? db()
          .select({
            id: schema.bookings.id,
            status: schema.bookings.status,
            title: schema.eventTypes.title,
            transcriptStatus: schema.bookings.transcriptStatus,
          })
          .from(schema.bookings)
          .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
          .where(inArray(schema.bookings.id, bookingIds))
      : [],
    bookingIds.length
      ? db()
          .select({ bookingId: schema.meetingRecaps.bookingId })
          .from(schema.meetingRecaps)
          .where(inArray(schema.meetingRecaps.bookingId, bookingIds))
      : [],
    bookingIds.length
      ? db()
          .select({ bookingId: schema.meetingTranscripts.bookingId })
          .from(schema.meetingTranscripts)
          .where(inArray(schema.meetingTranscripts.bookingId, bookingIds))
      : [],
  ]);
  const byParent = new Map<string, TimelineItem[]>();
  for (const r of replies) {
    const list = byParent.get(r.parentId!) ?? [];
    if (list.length < THREAD_CAP) list.push(shape(r, tz));
    byParent.set(r.parentId!, list);
  }
  const booking = new Map(bookings.map((b) => [b.id, b]));
  const hasRecap = new Set(recaps.map((r) => r.bookingId));
  const hasTranscript = new Set(transcripts.map((t) => t.bookingId));
  const items = rows.map((r) => {
    const it = shape(r, tz);
    it.replies = byParent.get(r.id) ?? [];
    const b = r.bookingId && MEETING_TYPES.has(r.type) ? booking.get(r.bookingId) : undefined;
    if (b)
      it.meeting = {
        title: b.title ?? "Meeting",
        status: b.status,
        recap: hasRecap.has(b.id),
        transcript: hasTranscript.has(b.id) || b.transcriptStatus === "ready",
      };
    return it;
  });
  await addFileTypes(rows[0]!.workspaceId, [...items, ...items.flatMap((it) => it.replies)]);
  return items;
}

/** One entry with its whole thread, for the side pane. */
export async function timelineEntry(
  workspaceId: string,
  contactId: string,
  id: string,
  viewer: string | null = null,
) {
  // A plain select: the predicate names the table, which relational queries alias.
  const [e] = await db()
    .select()
    .from(schema.contactEvents)
    .where(
      and(
        eq(schema.contactEvents.id, id),
        eq(schema.contactEvents.workspaceId, workspaceId),
        eq(schema.contactEvents.contactId, contactId),
        contactEventsVisibleTo(viewer),
      ),
    )
    .limit(1);
  if (!e) return null;
  const rootId = e.parentId ?? e.id;
  const thread = await db()
    .select()
    .from(schema.contactEvents)
    .where(
      and(
        eq(schema.contactEvents.contactId, contactId),
        or(eq(schema.contactEvents.id, rootId), eq(schema.contactEvents.parentId, rootId)),
        contactEventsVisibleTo(viewer),
      ),
    )
    .orderBy(asc(schema.contactEvents.createdAt), asc(schema.contactEvents.id))
    .limit(200);
  return { entry: e, thread };
}
