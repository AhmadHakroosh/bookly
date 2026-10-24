import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, schema, sql } from "@bookly/db";
import type { Contact, ContactEventType, Thread, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { contactsVisibleTo } from "./access/hiring";
import { canSeeFile } from "./drive";
import { hasFlag } from "./flags";
import { hasFeature, LimitError } from "./limits";
import { notify } from "./notifications";
import { channels, publish } from "./realtime";
import { listProfiles } from "./scheduling";
import { parseMentions } from "./tasks";
import { addFileTypes, attachmentsOf, displayName, tidy, type FileRef } from "./timeline";

/*
 * Messages (0.19.0). Two kinds of thread:
 * - guest: the one conversation with a contact, seen by every member. What the guest sees is
 *   email, so its messages ARE the contact's timeline emails (in and out, `contact_events`)
 *   plus the notes the guest left on the booking page; members add internal notes
 *   (`thread_messages`). Writing to the guest sends an email with the signed Reply-To, and the
 *   reply comes back through the inbound webhook onto the timeline, and so here.
 * - team: a thread between members, free-standing or about a contact; only its participants
 *   (creator, the people added, anyone @-mentioned) see it.
 * Gates: `guestMessages` (Pro) for guest threads, `teamMessages` (Team) for team threads and
 * notes; the `messages` flag decides whether any of it exists yet.
 * Realtime first (ADR 0007): every write tells the open tabs of whoever sees the thread, and
 * members hear about messages through `notify()`, which emails only when they are not here.
 */

export type Viewer = { userId: string; ws: Workspace };

export const canGuest = (ws: Workspace) => hasFeature(ws, "guestMessages");
export const canTeam = (ws: Workspace) => hasFeature(ws, "teamMessages");

const t = schema.threads;
const isParticipant = (userId: string) =>
  sql`exists (select 1 from ${schema.threadParticipants} p where p.thread_id = ${t.id} and p.user_id = ${userId})`;

/** Threads this member may see: guest threads (Pro) and the team threads they are in (Team). */
export function visibleThreads(v: Viewer) {
  // A guest who exists only as a candidate: their conversation only for their team (ADR 0005).
  const guestVisible = sql`(${t.contactId} is null or exists (
    select 1 from ${schema.contacts} where ${schema.contacts.id} = ${t.contactId}
      and ${contactsVisibleTo(v.userId)}
  ))`;
  const kinds = [
    ...(canGuest(v.ws) ? [and(eq(t.kind, "guest"), guestVisible)!] : []),
    ...(canTeam(v.ws) ? [and(eq(t.kind, "team"), isParticipant(v.userId))] : []),
  ];
  return and(eq(t.workspaceId, v.ws.id), kinds.length ? or(...kinds) : sql`false`)!;
}

/** Someone else wrote since this member last opened the thread. */
const unread = (userId: string) => sql<boolean>`(
  ${t.lastMessageAt} is not null
  and ${t.lastAuthorId} is distinct from ${userId}
  and ${t.lastMessageAt} > coalesce(
    (select r.read_at from ${schema.threadReads} r where r.thread_id = ${t.id} and r.user_id = ${userId}),
    '-infinity'::timestamptz
  )
)`;

/** The sidebar, the page and Home all ask: counted once per request (the workspace is cached too). */
const unreadCount = cache(async (ws: Workspace, userId: string): Promise<number> => {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(t)
    .where(and(visibleThreads({ ws, userId }), isNull(t.closedAt), unread(userId)));
  return row?.n ?? 0;
});

export const unreadThreads = (v: Viewer) => unreadCount(v.ws, v.userId);

/** For the live stream: the unread count and the newest activity, so tabs refresh when either moves. */
export async function messagesPulse(v: Viewer): Promise<{ unread: number; latest: string | null }> {
  const [[counts], [latest]] = await Promise.all([
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(visibleThreads(v), isNull(t.closedAt), unread(v.userId))),
    db()
      .select({ at: sql<string | null>`max(${t.lastActivityAt})::text` })
      .from(t)
      .where(visibleThreads(v)),
  ]);
  return { unread: counts?.n ?? 0, latest: latest?.at ?? null };
}

/**
 * Tells the open tabs of everyone who sees this thread that it moved: every member for a guest
 * thread, the participants for a team thread. Tabs then ask for their own unread count.
 */
async function threadMoved(workspaceId: string, thread: Pick<Thread, "id" | "kind">) {
  const to =
    thread.kind === "guest"
      ? [channels.members(workspaceId)]
      : (
          await db()
            .select({ userId: schema.threadParticipants.userId })
            .from(schema.threadParticipants)
            .where(eq(schema.threadParticipants.threadId, thread.id))
        ).map((p) => channels.member(workspaceId, p.userId));
  await publish(to, "messages", { threadId: thread.id });
}

/* ---------------- Guest threads follow the contact's timeline ---------------- */

/** The contact's conversation, created the first time anything happens in it. */
export async function guestThread(workspaceId: string, contactId: string): Promise<Thread> {
  await db()
    .insert(t)
    .values({ workspaceId, kind: "guest", contactId, lastActivityAt: new Date() })
    .onConflictDoNothing({ target: t.contactId, where: sql`kind = 'guest'` });
  const [row] = await db()
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.contactId, contactId), eq(t.kind, "guest")))
    .limit(1);
  return row!;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const previewOf = (text: string | null) => (text ? text.replace(/\s+/g, " ").slice(0, 200) : null);

/**
 * An email a member wrote (rather than one Bookly sent on its own, like a confirmation or a
 * reminder, which also name the host in `sentBy` so replies reach them). `written` marks it
 * from 0.19.0; the kinds cover emails logged before that.
 */
export const writtenByMember = (data: Record<string, unknown>) =>
  data.written === true ||
  ["reply", "message", "proposal", "paymentRequest", "checkIn"].includes(String(data.kind));

/** Timeline entries that belong in the guest conversation. */
export const isConversationEvent = (type: ContactEventType, data: Record<string, unknown>) =>
  type === "email_sent" || type === "email_received" || (type === "booked" && !!str(data.notes));

/**
 * Called for every new timeline entry (from `logContactEvent`): emails and booking-page notes
 * move the contact's conversation up the list. A guest's email or a member's own email counts
 * as a message (unread for the others); automatic emails only move it. A guest writing reopens it.
 */
export async function contactActivity(
  workspaceId: string,
  contactId: string,
  e: { type: ContactEventType; summary: string; data: Record<string, unknown> },
) {
  if (!isConversationEvent(e.type, e.data)) return;
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!ws || !(await hasFlag(ws, "messages"))) return;
  const thread = await guestThread(workspaceId, contactId);
  const fromGuest = e.type !== "email_sent";
  const author = !fromGuest && writtenByMember(e.data) ? str(e.data.sentBy) : null;
  const now = new Date();
  await db()
    .update(t)
    .set({
      lastActivityAt: now,
      preview: previewOf(
        e.type === "booked"
          ? str(e.data.notes)
          : fromGuest || author
            ? (tidy(str(e.data.body)) ?? e.summary)
            : e.summary,
      ),
      ...(fromGuest || author ? { lastMessageAt: now, lastAuthorId: author } : {}),
      ...(fromGuest ? { closedAt: null } : {}),
    })
    .where(eq(t.id, thread.id));
  await threadMoved(workspaceId, thread);
}

/* ---------------- Reading ---------------- */

export type ThreadBox = "inbox" | "unread" | "guests" | "team" | "closed";
export const BOXES: ThreadBox[] = ["inbox", "unread", "guests", "team", "closed"];

export type ThreadRow = {
  id: string;
  kind: Thread["kind"];
  title: string;
  contactId: string | null;
  contactEmail: string | null;
  preview: string | null;
  lastActivityAt: Date;
  closed: boolean;
  unread: boolean;
};

type Cursor = { at: string; id: string };
export const encodeThreadCursor = (c: Cursor) =>
  Buffer.from(`${c.at}|${c.id}`).toString("base64url");
export function decodeThreadCursor(s: string | null | undefined): Cursor | null {
  if (!s || s.length > 200) return null;
  const [at, id] = Buffer.from(s, "base64url").toString().split("|");
  return at && id && !Number.isNaN(Date.parse(at)) && /^[0-9a-f-]{36}$/i.test(id)
    ? { at, id }
    : null;
}

const PAGE = 30;
// Postgres keeps microseconds, cursors carry milliseconds: compare at millisecond precision.
const activityMs = sql`date_trunc('milliseconds', ${t.lastActivityAt})`;

export async function listThreads(
  v: Viewer,
  opts: { box?: ThreadBox; q?: string; after?: string | null } = {},
): Promise<{ rows: ThreadRow[]; next: string | null }> {
  const box = opts.box ?? "inbox";
  const after = decodeThreadCursor(opts.after);
  const q = opts.q?.trim().slice(0, 100);
  const c = schema.contacts;
  const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const conds = [
    visibleThreads(v),
    box === "closed" ? isNotNull(t.closedAt) : isNull(t.closedAt),
    box === "unread" ? unread(v.userId) : undefined,
    box === "guests" ? eq(t.kind, "guest") : undefined,
    box === "team" ? eq(t.kind, "team") : undefined,
    like ? or(ilike(t.subject, like), ilike(c.name, like), ilike(c.email, like)) : undefined,
    after ? sql`(${activityMs}, ${t.id}) < (${after.at}::timestamptz, ${after.id})` : undefined,
  ];
  const rows = await db()
    .select({
      id: t.id,
      kind: t.kind,
      subject: t.subject,
      contactId: t.contactId,
      contactName: c.name,
      contactEmail: c.email,
      preview: t.preview,
      lastActivityAt: t.lastActivityAt,
      closedAt: t.closedAt,
      unread: unread(v.userId),
    })
    .from(t)
    .leftJoin(c, eq(c.id, t.contactId))
    .where(and(...conds))
    .orderBy(desc(activityMs), desc(t.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: r.id,
      kind: r.kind,
      title:
        r.kind === "guest"
          ? r.contactName || r.contactEmail || "A contact"
          : r.subject || "Team thread",
      contactId: r.contactId,
      contactEmail: r.contactEmail,
      preview: r.preview,
      lastActivityAt: r.lastActivityAt,
      closed: !!r.closedAt,
      unread: !!r.unread,
    })),
    next:
      rows.length > PAGE && last
        ? encodeThreadCursor({ at: last.lastActivityAt.toISOString(), id: last.id })
        : null,
  };
}

export type ThreadDetails = {
  thread: Thread;
  contact: Pick<Contact, "id" | "name" | "email" | "emailOptOut"> | null;
  participants: { userId: string; name: string }[];
};

export async function threadDetails(v: Viewer, id: string): Promise<ThreadDetails | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [thread] = await db()
    .select()
    .from(t)
    .where(and(eq(t.id, id), visibleThreads(v)))
    .limit(1);
  if (!thread) return null;
  const [contact, people, members] = await Promise.all([
    thread.contactId
      ? db().query.contacts.findFirst({
          where: eq(schema.contacts.id, thread.contactId),
          columns: { id: true, name: true, email: true, emailOptOut: true },
        })
      : null,
    thread.kind === "team"
      ? db()
          .select({ userId: schema.threadParticipants.userId })
          .from(schema.threadParticipants)
          .where(eq(schema.threadParticipants.threadId, thread.id))
          .orderBy(asc(schema.threadParticipants.createdAt))
      : [],
    listProfiles(v.ws.id),
  ]);
  const name = new Map(members.map((m) => [m.userId, m.displayName]));
  return {
    thread,
    contact: contact ?? null,
    participants: people.map((p) => ({
      userId: p.userId,
      name: name.get(p.userId) ?? "Former member",
    })),
  };
}

export type ThreadItem = {
  id: string;
  /** email: the guest's or a member's email; booking: what they wrote when booking. */
  source: "email" | "booking" | "note" | "message";
  at: string;
  /** Written by us (a member's email, note or message) rather than the guest. */
  ours: boolean;
  /** An email Bookly sent on its own (confirmation, reminder): shown folded. */
  automatic: boolean;
  author: string | null;
  subject: string | null;
  body: string | null;
  attachments: FileRef[];
  /** For emails: the timeline entry (link and the parent of a reply). */
  eventId: string | null;
};

type ItemCursor = { at: string; id: string };
const ITEMS = 40;

/** A window of the thread, oldest first, with a cursor for the earlier part. */
export async function threadItems(
  v: Viewer,
  d: ThreadDetails,
  before?: string | null,
): Promise<{ items: ThreadItem[]; earlier: string | null }> {
  const cur = decodeThreadCursor(before) as ItemCursor | null;
  const { thread } = d;
  const ce = schema.contactEvents;
  const tm = schema.threadMessages;
  const older = (at: unknown, id: unknown) =>
    cur
      ? sql`and (date_trunc('milliseconds', ${at}), ${id}) < (${cur.at}::timestamptz, ${cur.id})`
      : sql``;
  const guestPart =
    thread.kind === "guest" && thread.contactId
      ? sql`select ${ce.id} as id, ${ce.createdAt} as at, 'event' as src from ${ce}
          where ${ce.workspaceId} = ${v.ws.id} and ${ce.contactId} = ${thread.contactId}
          and (${ce.type} in ('email_sent', 'email_received')
            or (${ce.type} = 'booked' and coalesce(${ce.data}->>'notes', '') <> ''))
          ${older(ce.createdAt, ce.id)}
          union all `
      : sql``;
  const r = await db().execute<{ id: string; at: Date; src: "event" | "message" }>(sql`
    ${guestPart}
    select ${tm.id} as id, ${tm.createdAt} as at, 'message' as src from ${tm}
    where ${tm.threadId} = ${thread.id} ${older(tm.createdAt, tm.id)}
    order by at desc, id desc
    limit ${ITEMS + 1}`);
  const picked = (r.rows as { id: string; at: Date; src: "event" | "message" }[]).slice(0, ITEMS);
  const eventIds = picked.filter((p) => p.src === "event").map((p) => p.id);
  const messageIds = picked.filter((p) => p.src === "message").map((p) => p.id);
  const [events, messages, links, members] = await Promise.all([
    eventIds.length ? db().select().from(ce).where(inArray(ce.id, eventIds)) : [],
    messageIds.length ? db().select().from(tm).where(inArray(tm.id, messageIds)) : [],
    messageIds.length
      ? db()
          .select({
            targetId: schema.fileLinks.targetId,
            fileId: schema.files.id,
            name: schema.files.name,
          })
          .from(schema.fileLinks)
          .innerJoin(schema.files, eq(schema.files.id, schema.fileLinks.fileId))
          .where(
            and(
              eq(schema.fileLinks.targetType, "thread_message"),
              inArray(schema.fileLinks.targetId, messageIds),
            ),
          )
      : [],
    listProfiles(v.ws.id),
  ]);
  const name = new Map(members.map((m) => [m.userId, m.displayName]));
  const byEvent = new Map(events.map((e) => [e.id, e]));
  const byMessage = new Map(messages.map((m) => [m.id, m]));
  const items: ThreadItem[] = picked.map((p) => {
    if (p.src === "message") {
      const m = byMessage.get(p.id)!;
      return {
        id: m.id,
        source: thread.kind === "guest" ? "note" : "message",
        at: m.createdAt.toISOString(),
        ours: true,
        automatic: false,
        author: m.authorId ? (name.get(m.authorId) ?? "Former member") : null,
        subject: null,
        body: m.body,
        attachments: links
          .filter((l) => l.targetId === m.id)
          .map((l) => ({ filename: l.name, fileId: l.fileId, reason: null, mime: null })),
        eventId: null,
      };
    }
    const e = byEvent.get(p.id)!;
    const data = e.data as Record<string, unknown>;
    if (e.type === "booked")
      return {
        id: e.id,
        source: "booking",
        at: e.createdAt.toISOString(),
        ours: false,
        automatic: false,
        author: d.contact?.name || d.contact?.email || null,
        subject: e.summary,
        body: str(data.notes),
        attachments: [],
        eventId: e.id,
      };
    const sentBy = str(data.sentBy);
    const automatic = e.type === "email_sent" && !writtenByMember(data);
    return {
      id: e.id,
      source: "email",
      at: e.createdAt.toISOString(),
      ours: e.type === "email_sent",
      automatic,
      author:
        e.type === "email_received"
          ? displayName(str(data.from)) || d.contact?.name || null
          : sentBy && !automatic
            ? (name.get(sentBy) ?? "Former member")
            : null,
      subject: str(data.subject) ?? e.summary,
      body: tidy(str(data.body)),
      attachments: attachmentsOf(data),
      eventId: e.id,
    };
  });
  await addFileTypes(
    v.ws.id,
    items.map((i) => ({ attachments: i.attachments, file: null })),
  );
  const last = picked[picked.length - 1];
  return {
    items: items.reverse(),
    earlier:
      r.rows.length > ITEMS && last
        ? encodeThreadCursor({ at: last.at.toISOString(), id: last.id })
        : null,
  };
}

/** The newest email in the guest conversation: a message from Messages answers it. */
export async function latestEmail(wsId: string, contactId: string) {
  const ce = schema.contactEvents;
  const [row] = await db()
    .select({ id: ce.id })
    .from(ce)
    .where(
      and(
        eq(ce.workspaceId, wsId),
        eq(ce.contactId, contactId),
        inArray(ce.type, ["email_sent", "email_received"]),
      ),
    )
    .orderBy(desc(ce.createdAt), desc(ce.id))
    .limit(1);
  return row?.id ?? null;
}

export async function markThreadRead(v: Viewer, threadId: string) {
  await db()
    .insert(schema.threadReads)
    .values({ threadId, userId: v.userId, readAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.threadReads.threadId, schema.threadReads.userId],
      set: { readAt: new Date() },
    });
  // The member's other tabs drop the unread badge too.
  await publish([channels.member(v.ws.id, v.userId)], "messages", { threadId });
}

/* ---------------- Writing ---------------- */

function needTeam(ws: Workspace) {
  if (!canTeam(ws))
    throw new LimitError("Team threads and internal notes come with the Team plan.", "team");
}

/** Members (by user id) that exist in this workspace. */
async function members(wsId: string) {
  return (await listProfiles(wsId)).map((p) => ({ userId: p.userId, displayName: p.displayName }));
}

/** Files the author may see, linked to the message so everyone in the thread can open them. */
async function linkFiles(v: Viewer, messageId: string, fileIds: string[]) {
  if (!fileIds.length) return;
  if (!(await hasFlag(v.ws, "files")) || !hasFeature(v.ws, "attachments"))
    throw new LimitError("Attachments come with Pro.", "pro");
  for (const fileId of [...new Set(fileIds)].slice(0, 10)) {
    const f = await canSeeFile(v, fileId);
    if (!f) continue;
    await db()
      .insert(schema.fileLinks)
      .values({
        workspaceId: v.ws.id,
        fileId: f.id,
        targetType: "thread_message",
        targetId: messageId,
        createdBy: v.userId,
      })
      .onConflictDoNothing();
  }
}

async function addParticipantsRaw(wsId: string, threadId: string, userIds: string[]) {
  if (!userIds.length) return;
  await db()
    .insert(schema.threadParticipants)
    .values(userIds.map((userId) => ({ threadId, userId, workspaceId: wsId })))
    .onConflictDoNothing();
}

async function insertMessage(
  v: Viewer,
  d: ThreadDetails,
  body: string,
  fileIds: string[],
): Promise<{ id: string; mentions: string[] }> {
  const text = body.trim().slice(0, 8000);
  if (!text && !fileIds.length) throw new Error("Write something first.");
  const people = await members(v.ws.id);
  const mentions = parseMentions(text, people).filter((id) => id !== v.userId);
  const [m] = await db()
    .insert(schema.threadMessages)
    .values({
      workspaceId: v.ws.id,
      threadId: d.thread.id,
      authorId: v.userId,
      body: text,
      mentions,
    })
    .returning();
  await linkFiles(v, m!.id, fileIds);
  const now = new Date();
  await db()
    .update(t)
    .set({
      lastActivityAt: now,
      lastMessageAt: now,
      lastAuthorId: v.userId,
      preview: previewOf(text) ?? "Shared a file",
    })
    .where(eq(t.id, d.thread.id));
  await markThreadRead(v, d.thread.id);
  return { id: m!.id, mentions };
}

const authorName = async (v: Viewer) =>
  (await members(v.ws.id)).find((m) => m.userId === v.userId)?.displayName ?? "A teammate";

/** A message in a team thread: mentioned members join it; everyone in it hears about it. */
export async function postTeamMessage(
  v: Viewer,
  d: ThreadDetails,
  body: string,
  fileIds: string[] = [],
) {
  needTeam(v.ws);
  if (d.thread.kind !== "team")
    throw new Error("Write to the guest from the guest's conversation.");
  const m = await insertMessage(v, d, body, fileIds);
  await addParticipantsRaw(v.ws.id, d.thread.id, m.mentions);
  const who = await authorName(v);
  const title = d.thread.subject || "a team thread";
  const everyone = new Set([...d.participants.map((p) => p.userId), ...m.mentions]);
  everyone.delete(v.userId);
  for (const userId of everyone)
    void notify(v.ws, userId, {
      kind: m.mentions.includes(userId) ? "message.mentioned" : "message.posted",
      title: m.mentions.includes(userId)
        ? `${who} mentioned you in “${title}”`
        : `${who} in “${title}”`,
      body: body.trim().slice(0, 160),
      link: `/admin/messages?thread=${d.thread.id}`,
      dedupeKey: `thread-message:${m.id}:${userId}`,
    });
  await threadMoved(v.ws.id, d.thread);
  return m;
}

/** An internal note on a guest's conversation; the guest never sees it. Mentions are notified. */
export async function addNote(v: Viewer, d: ThreadDetails, body: string, fileIds: string[] = []) {
  needTeam(v.ws);
  if (d.thread.kind !== "guest") throw new Error("Notes belong to a guest's conversation.");
  const m = await insertMessage(v, d, body, fileIds);
  const who = await authorName(v);
  const title = d.contact?.name || d.contact?.email || "a contact";
  for (const userId of m.mentions)
    void notify(v.ws, userId, {
      kind: "message.mentioned",
      title: `${who} mentioned you in a note on ${title}`,
      body: body.trim().slice(0, 160),
      link: `/admin/messages?thread=${d.thread.id}`,
      dedupeKey: `thread-message:${m.id}:${userId}`,
    });
  await threadMoved(v.ws.id, d.thread);
  return m;
}

/** A new team thread: the creator, the people chosen and anyone @-mentioned in the first message. */
export async function createTeamThread(
  v: Viewer,
  input: {
    subject: string;
    participantIds: string[];
    contactId?: string | null;
    body: string;
    fileIds?: string[];
  },
) {
  needTeam(v.ws);
  const subject = input.subject.trim().slice(0, 200);
  if (!subject) throw new Error("Give the thread a subject.");
  const people = await members(v.ws.id);
  const known = new Set(people.map((p) => p.userId));
  const chosen = [...new Set(input.participantIds)].filter(
    (id) => known.has(id) && id !== v.userId,
  );
  let contactId: string | null = null;
  if (input.contactId) {
    const c = await db().query.contacts.findFirst({
      where: and(eq(schema.contacts.id, input.contactId), eq(schema.contacts.workspaceId, v.ws.id)),
      columns: { id: true },
    });
    if (!c) throw new Error("That contact is gone.");
    contactId = c.id;
  }
  const [thread] = await db()
    .insert(t)
    .values({ workspaceId: v.ws.id, kind: "team", subject, contactId, createdBy: v.userId })
    .returning();
  await addParticipantsRaw(v.ws.id, thread!.id, [v.userId, ...chosen]);
  const d: ThreadDetails = {
    thread: thread!,
    contact: null,
    participants: [v.userId, ...chosen].map((userId) => ({ userId, name: "" })),
  };
  const m = await postTeamMessage(v, d, input.body, input.fileIds ?? []);
  return { thread: thread!, participants: chosen, mentions: m.mentions };
}

export async function addParticipants(v: Viewer, d: ThreadDetails, userIds: string[]) {
  needTeam(v.ws);
  if (d.thread.kind !== "team") throw new Error("Everyone sees a guest's conversation already.");
  const known = new Set((await members(v.ws.id)).map((p) => p.userId));
  const current = new Set(d.participants.map((p) => p.userId));
  const added = [...new Set(userIds)].filter((id) => known.has(id) && !current.has(id));
  await addParticipantsRaw(v.ws.id, d.thread.id, added);
  const who = await authorName(v);
  for (const userId of added)
    void notify(v.ws, userId, {
      kind: "message.posted",
      title: `${who} added you to “${d.thread.subject || "a team thread"}”`,
      link: `/admin/messages?thread=${d.thread.id}`,
      dedupeKey: `thread-added:${d.thread.id}:${userId}`,
    });
  if (added.length) await threadMoved(v.ws.id, d.thread);
  return added;
}

export async function setClosed(v: Viewer, d: ThreadDetails, closed: boolean) {
  await db()
    .update(t)
    .set({ closedAt: closed ? new Date() : null })
    .where(eq(t.id, d.thread.id));
  await threadMoved(v.ws.id, d.thread);
}
