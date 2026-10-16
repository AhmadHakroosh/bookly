import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, schema, sql } from "@bookly/db";
import type {
  Task,
  TaskComment,
  TaskFilters,
  TaskStatus,
  TaskView,
  Workspace,
} from "@bookly/db/schema";
import { db } from "@/lib/db";
import { addDays, todayIn, zonedToUtc } from "@/lib/time";
import { notify } from "./notifications";
import { getProfileByUser, listProfiles } from "./scheduling";

/*
 * The task board (0.16.0). Statuses are the workspace's own columns; a task's place is its
 * status plus a fractional `position`, so a drag rewrites one row. `tasks.done_at` stays the
 * single "is it done" fact every older query reads: it follows the status's `isDone`.
 */

/* ---------------- Statuses ---------------- */

export const DEFAULT_STATUSES = [
  { name: "To do", color: "#71717a", isDefault: true, isDone: false },
  { name: "In progress", color: "#2563eb", isDefault: false, isDone: false },
  { name: "Done", color: "#16a34a", isDefault: false, isDone: true },
] as const;

const activeStatuses = (workspaceId: string) =>
  db()
    .select()
    .from(schema.taskStatuses)
    .where(
      and(eq(schema.taskStatuses.workspaceId, workspaceId), isNull(schema.taskStatuses.archivedAt)),
    )
    .orderBy(asc(schema.taskStatuses.position), asc(schema.taskStatuses.createdAt));

/** The workspace's active statuses in board order, seeding the default flow the first time. */
export async function ensureStatuses(workspaceId: string): Promise<TaskStatus[]> {
  const rows = await activeStatuses(workspaceId);
  if (rows.length) return rows;
  await db()
    .insert(schema.taskStatuses)
    .values(DEFAULT_STATUSES.map((s, position) => ({ ...s, workspaceId, position })))
    // Two first visits at once: the unique (workspace, name) index lets one of them win.
    .onConflictDoNothing();
  return activeStatuses(workspaceId);
}

/** The status new tasks start in, and the one "Mark done" moves to. */
export function pickStatuses(statuses: TaskStatus[]) {
  const open = statuses.filter((s) => !s.isDone);
  return {
    initial: open.find((s) => s.isDefault) ?? open[0] ?? statuses[0]!,
    done: statuses.find((s) => s.isDone) ?? statuses[statuses.length - 1]!,
  };
}

export async function initialStatusId(workspaceId: string) {
  return pickStatuses(await ensureStatuses(workspaceId)).initial.id;
}

/** Board order puts new tasks last in their column: positions are milliseconds since 1970. */
export const newPosition = () => Date.now();

export type StatusInput = {
  name: string;
  color: string;
  isDone: boolean;
  wipLimit: number | null;
};

const HEX = /^#[0-9a-f]{6}$/i;

export function cleanStatus(input: Partial<StatusInput>): Partial<StatusInput> | string {
  const out: Partial<StatusInput> = {};
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 40);
    if (!name) return "A status needs a name.";
    out.name = name;
  }
  if (input.color !== undefined) {
    if (!HEX.test(input.color)) return "Pick a colour.";
    out.color = input.color.toLowerCase();
  }
  if (input.isDone !== undefined) out.isDone = input.isDone;
  if (input.wipLimit !== undefined)
    out.wipLimit =
      input.wipLimit && input.wipLimit > 0 ? Math.min(Math.round(input.wipLimit), 999) : null;
  return out;
}

/**
 * Checks a proposed set of active statuses: at least one open and one done column, exactly
 * one default, and the default is open. Returns an error message or null.
 */
export function statusSetProblem(set: Pick<TaskStatus, "isDone" | "isDefault" | "name">[]) {
  if (!set.some((s) => !s.isDone)) return "Keep at least one status that is not done.";
  if (!set.some((s) => s.isDone)) return "Keep at least one done status.";
  const defaults = set.filter((s) => s.isDefault);
  if (defaults.length !== 1) return "Exactly one status is the default for new tasks.";
  if (defaults[0]!.isDone) return "The default status cannot be a done status.";
  const names = set.map((s) => s.name.toLowerCase());
  if (new Set(names).size !== names.length) return "Two statuses have the same name.";
  return null;
}

/** Sets `done_at` on every task of a status after its "done" meaning changed. */
export async function syncDoneForStatus(workspaceId: string, statusId: string, isDone: boolean) {
  await db()
    .update(schema.tasks)
    .set(isDone ? { doneAt: sql`coalesce(${schema.tasks.doneAt}, now())` } : { doneAt: null })
    .where(and(eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.statusId, statusId)));
}

/** Archives a status, moving its tasks to `intoId` first. */
export async function archiveStatus(workspaceId: string, statusId: string, intoId: string) {
  const [into] = await db()
    .select()
    .from(schema.taskStatuses)
    .where(
      and(eq(schema.taskStatuses.id, intoId), eq(schema.taskStatuses.workspaceId, workspaceId)),
    );
  if (!into || into.archivedAt) return 0;
  const moved = await db()
    .update(schema.tasks)
    .set({
      statusId: into.id,
      doneAt: into.isDone ? sql`coalesce(${schema.tasks.doneAt}, now())` : null,
    })
    .where(and(eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.statusId, statusId)))
    .returning({ id: schema.tasks.id });
  await db()
    .update(schema.taskStatuses)
    .set({ archivedAt: new Date(), isDefault: false })
    .where(
      and(eq(schema.taskStatuses.id, statusId), eq(schema.taskStatuses.workspaceId, workspaceId)),
    );
  return moved.length;
}

/* ---------------- Moving ---------------- */

/** The position between two neighbours (either may be missing), or null when they are too close. */
export function between(prev: number | null, next: number | null): number | null {
  if (prev === null && next === null) return 1024;
  if (prev === null) return next! - 1024;
  if (next === null) return prev + 1024;
  const mid = (prev + next) / 2;
  return mid > prev && mid < next && next - prev > 1e-6 ? mid : null;
}

async function renumber(workspaceId: string, statusId: string) {
  const rows = await db()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.statusId, statusId)))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.id));
  for (const [i, r] of rows.entries())
    await db()
      .update(schema.tasks)
      .set({ position: (i + 1) * 1024 })
      .where(eq(schema.tasks.id, r.id));
}

/**
 * Puts a task into `statusId` between `prevId` and `nextId` (the cards that end up above and
 * below it). Returns the task before and after, or null when something is not in this workspace.
 */
export async function moveTask(
  workspaceId: string,
  taskId: string,
  statusId: string,
  prevId: string | null,
  nextId: string | null,
): Promise<{ before: Task; after: Task; from: TaskStatus | null; to: TaskStatus } | null> {
  const [task, to] = await Promise.all([
    db().query.tasks.findFirst({
      where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.workspaceId, workspaceId)),
    }),
    db().query.taskStatuses.findFirst({
      where: and(
        eq(schema.taskStatuses.id, statusId),
        eq(schema.taskStatuses.workspaceId, workspaceId),
        isNull(schema.taskStatuses.archivedAt),
      ),
    }),
  ]);
  if (!task || !to) return null;
  const neighbour = async (id: string | null) => {
    if (!id || id === taskId) return null;
    const n = await db().query.tasks.findFirst({
      where: and(
        eq(schema.tasks.id, id),
        eq(schema.tasks.workspaceId, workspaceId),
        eq(schema.tasks.statusId, statusId),
      ),
      columns: { position: true },
    });
    return n?.position ?? null;
  };
  let position = between(await neighbour(prevId), await neighbour(nextId));
  if (position === null) {
    await renumber(workspaceId, statusId);
    position = between(await neighbour(prevId), await neighbour(nextId)) ?? newPosition();
  }
  const [after] = await db()
    .update(schema.tasks)
    .set({
      statusId: to.id,
      position,
      doneAt: to.isDone ? (task.doneAt ?? new Date()) : null,
    })
    .where(eq(schema.tasks.id, task.id))
    .returning();
  const from = task.statusId
    ? ((await db().query.taskStatuses.findFirst({
        where: eq(schema.taskStatuses.id, task.statusId),
      })) ?? null)
    : null;
  return { before: task, after: after!, from, to };
}

/** "Mark done" / "Reopen" from the lists: the first done status, or back to the default. */
export async function setTaskDone(workspaceId: string, taskId: string, done: boolean) {
  const { initial, done: doneStatus } = pickStatuses(await ensureStatuses(workspaceId));
  const to = done ? doneStatus : initial;
  return moveTask(workspaceId, taskId, to.id, null, null).then(async (r) => {
    if (!r) return null;
    // A move "to the end" of the column: after its last card.
    const [last] = await db()
      .select({ position: schema.tasks.position })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.statusId, to.id)))
      .orderBy(desc(schema.tasks.position))
      .limit(1);
    if (last && last.position !== r.after.position)
      await db()
        .update(schema.tasks)
        .set({ position: Math.max(last.position + 1024, newPosition()) })
        .where(eq(schema.tasks.id, taskId));
    return r;
  });
}

/* ---------------- Reading ---------------- */

export type BoardTask = Task & {
  contactName: string | null;
  bookingTitle: string | null;
  bookingStartAt: Date | null;
  eventTypeId: string | null;
  comments: number;
};

const select = {
  t: schema.tasks,
  contactName: schema.contacts.name,
  contactEmail: schema.contacts.email,
  bookingTitle: schema.eventTypes.title,
  bookingStartAt: schema.bookings.startAt,
  eventTypeId: schema.bookings.eventTypeId,
  comments: sql<number>`(select count(*)::int from ${schema.taskComments} c where c.task_id = ${schema.tasks.id})`,
};

function base() {
  return db()
    .select(select)
    .from(schema.tasks)
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.tasks.contactId))
    .leftJoin(schema.bookings, eq(schema.bookings.id, schema.tasks.bookingId))
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId));
}

type Row = Awaited<ReturnType<ReturnType<typeof base>["where"]>>[number];
const flatten = (r: Row): BoardTask => ({
  ...r.t,
  contactName: r.contactName || r.contactEmail || null,
  bookingTitle: r.bookingTitle,
  bookingStartAt: r.bookingStartAt,
  eventTypeId: r.eventTypeId,
  comments: r.comments ?? 0,
});

export type FilterCtx = { workspaceId: string; viewerId: string; tz: string; now?: Date };

/** SQL conditions for a set of filters (the status filter is applied by the caller's columns). */
export function filterConds(f: TaskFilters, ctx: FilterCtx) {
  const now = ctx.now ?? new Date();
  const conds = [eq(schema.tasks.workspaceId, ctx.workspaceId)];
  if (f.assignee)
    conds.push(eq(schema.tasks.userId, f.assignee === "me" ? ctx.viewerId : f.assignee));
  if (f.contactId) conds.push(eq(schema.tasks.contactId, f.contactId));
  if (f.eventTypeId) conds.push(eq(schema.bookings.eventTypeId, f.eventTypeId));
  if (f.due) {
    const today = todayIn(ctx.tz, now);
    const endOfToday = zonedToUtc(today, 24 * 60, ctx.tz);
    if (f.due === "overdue") conds.push(lt(schema.tasks.dueAt, now), isNull(schema.tasks.doneAt));
    else if (f.due === "today")
      conds.push(
        gte(schema.tasks.dueAt, zonedToUtc(today, 0, ctx.tz)),
        lt(schema.tasks.dueAt, endOfToday),
      );
    else if (f.due === "week")
      conds.push(
        gte(schema.tasks.dueAt, now),
        lte(schema.tasks.dueAt, zonedToUtc(addDays(today, 7), 0, ctx.tz)),
      );
    else if (f.due === "none") conds.push(isNull(schema.tasks.dueAt));
  }
  return conds;
}

export type ColumnCursor = { position: number; id: string };
export const encodeColumnCursor = (t: Pick<Task, "position" | "id">) =>
  Buffer.from(`${t.position}|${t.id}`).toString("base64url");
export function decodeColumnCursor(s: unknown): ColumnCursor | null {
  if (typeof s !== "string" || !s) return null;
  const [p, id] = Buffer.from(s, "base64url").toString().split("|");
  const position = Number(p);
  return id && Number.isFinite(position) ? { position, id } : null;
}

export const COLUMN_PAGE = 50;

/** One column's cards in board order, a page at a time. */
export async function columnPage(
  status: TaskStatus,
  filters: TaskFilters,
  ctx: FilterCtx,
  cursor: ColumnCursor | null = null,
  limit = COLUMN_PAGE,
): Promise<{ rows: BoardTask[]; next: string | null }> {
  const conds = [...filterConds(filters, ctx), eq(schema.tasks.statusId, status.id)];
  if (cursor)
    conds.push(
      or(
        sql`${schema.tasks.position} > ${cursor.position}`,
        and(
          sql`${schema.tasks.position} = ${cursor.position}`,
          sql`${schema.tasks.id} > ${cursor.id}`,
        ),
      )!,
    );
  const rows = await base()
    .where(and(...conds))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit).map(flatten);
  return {
    rows: page,
    next: rows.length > limit ? encodeColumnCursor(page[page.length - 1]!) : null,
  };
}

/** Every visible column with its first page and total count (for the header and WIP hints). */
export async function board(statuses: TaskStatus[], filters: TaskFilters, ctx: FilterCtx) {
  const shown = filters.statusIds?.length
    ? statuses.filter((s) => filters.statusIds!.includes(s.id))
    : statuses;
  const counts = await db()
    .select({ statusId: schema.tasks.statusId, n: sql<number>`count(*)::int` })
    .from(schema.tasks)
    .leftJoin(schema.bookings, eq(schema.bookings.id, schema.tasks.bookingId))
    .where(and(...filterConds(filters, ctx)))
    .groupBy(schema.tasks.statusId);
  const total = new Map(counts.map((c) => [c.statusId, c.n]));
  return Promise.all(
    shown.map(async (s) => ({
      status: s,
      total: total.get(s.id) ?? 0,
      ...(await columnPage(s, filters, ctx)),
    })),
  );
}

export type ListCursor = { due: string; createdAt: string; id: string };
const INFINITY = "9999-12-31T00:00:00.000Z";
export const encodeListCursor = (t: Pick<Task, "dueAt" | "createdAt" | "id">) =>
  Buffer.from(
    `${(t.dueAt ?? new Date(INFINITY)).toISOString()}|${t.createdAt.toISOString()}|${t.id}`,
  ).toString("base64url");
export function decodeListCursor(s: unknown): ListCursor | null {
  if (typeof s !== "string" || !s) return null;
  const [due, createdAt, id] = Buffer.from(s, "base64url").toString().split("|");
  return due &&
    createdAt &&
    id &&
    !Number.isNaN(Date.parse(due)) &&
    !Number.isNaN(Date.parse(createdAt))
    ? { due, createdAt, id }
    : null;
}

export const LIST_PAGE = 50;

/** The list view: soonest due first (no date last), open tasks unless `showDone`. */
export async function listPage(
  filters: TaskFilters,
  ctx: FilterCtx,
  cursor: ListCursor | null = null,
  limit = LIST_PAGE,
): Promise<{ rows: BoardTask[]; next: string | null }> {
  const due = sql`coalesce(${schema.tasks.dueAt}, ${INFINITY}::timestamptz)`;
  const conds = filterConds(filters, ctx);
  if (!filters.showDone) conds.push(isNull(schema.tasks.doneAt));
  if (filters.statusIds?.length) conds.push(inArray(schema.tasks.statusId, filters.statusIds));
  if (cursor)
    conds.push(
      sql`(${due}, ${schema.tasks.createdAt}, ${schema.tasks.id}) > (${cursor.due}::timestamptz, ${cursor.createdAt}::timestamptz, ${cursor.id})`,
    );
  const rows = await base()
    .where(and(...conds))
    .orderBy(due, asc(schema.tasks.createdAt), asc(schema.tasks.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit).map(flatten);
  return {
    rows: page,
    next: rows.length > limit ? encodeListCursor(page[page.length - 1]!) : null,
  };
}

export async function getBoardTask(workspaceId: string, id: string): Promise<BoardTask | null> {
  const [r] = await base()
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.workspaceId, workspaceId)))
    .limit(1);
  return r ? flatten(r) : null;
}

/** Contacts that have tasks, for the contact filter (most recent first, capped). */
export async function taskContacts(workspaceId: string) {
  return db()
    .selectDistinct({
      id: schema.contacts.id,
      name: schema.contacts.name,
      email: schema.contacts.email,
    })
    .from(schema.tasks)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.tasks.contactId))
    .where(eq(schema.tasks.workspaceId, workspaceId))
    .limit(200);
}

/* ---------------- Editing ---------------- */

export type TaskPatch = {
  title?: string;
  description?: string | null;
  dueAt?: Date | null;
  userId?: string;
};

export async function updateTask(workspaceId: string, id: string, patch: TaskPatch) {
  const before = await db().query.tasks.findFirst({
    where: and(eq(schema.tasks.id, id), eq(schema.tasks.workspaceId, workspaceId)),
  });
  if (!before) return null;
  const set: Partial<Task> = {};
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 200) || before.title;
  if (patch.description !== undefined)
    set.description = patch.description?.trim().slice(0, 5000) || null;
  if (patch.dueAt !== undefined) {
    set.dueAt = patch.dueAt;
    // A new due date earns a new overdue nudge.
    if (patch.dueAt?.getTime() !== before.dueAt?.getTime()) set.nudgedAt = null;
  }
  if (patch.userId !== undefined) set.userId = patch.userId;
  if (!Object.keys(set).length) return { before, after: before };
  const [after] = await db()
    .update(schema.tasks)
    .set(set)
    .where(eq(schema.tasks.id, id))
    .returning();
  return { before, after: after! };
}

/** True when `userId` is a member of the workspace (has a profile there). */
export async function isMember(workspaceId: string, userId: string) {
  return !!(await getProfileByUser(workspaceId, userId));
}

/* ---------------- Comments ---------------- */

export type CommentRow = TaskComment & { authorName: string | null };

export const encodeCommentCursor = (c: Pick<TaskComment, "createdAt" | "id">) =>
  Buffer.from(`${c.createdAt.toISOString()}|${c.id}`).toString("base64url");
export function decodeCommentCursor(s: unknown): { createdAt: string; id: string } | null {
  if (typeof s !== "string" || !s) return null;
  const [createdAt, id] = Buffer.from(s, "base64url").toString().split("|");
  return createdAt && id && !Number.isNaN(Date.parse(createdAt)) ? { createdAt, id } : null;
}

/**
 * A task's comments, oldest first on screen, newest page first in the query: the latest `limit`,
 * or the ones before `before`. `earlier` is the cursor for the page before this one.
 */
export async function listComments(
  workspaceId: string,
  taskId: string,
  opts: { before?: { createdAt: string; id: string } | null; limit?: number } = {},
) {
  const limit = opts.limit ?? 50;
  const conds = [
    eq(schema.taskComments.workspaceId, workspaceId),
    eq(schema.taskComments.taskId, taskId),
  ];
  if (opts.before) {
    const at = new Date(opts.before.createdAt);
    conds.push(
      or(
        lt(schema.taskComments.createdAt, at),
        and(eq(schema.taskComments.createdAt, at), lt(schema.taskComments.id, opts.before.id)),
      )!,
    );
  }
  const [rows, people] = await Promise.all([
    db()
      .select()
      .from(schema.taskComments)
      .where(and(...conds))
      .orderBy(desc(schema.taskComments.createdAt), desc(schema.taskComments.id))
      .limit(limit + 1),
    listProfiles(workspaceId),
  ]);
  const name = new Map(people.map((p) => [p.userId, p.displayName]));
  const page = rows.slice(0, limit);
  return {
    rows: page.reverse().map((c): CommentRow => ({
      ...c,
      authorName: c.authorId ? (name.get(c.authorId) ?? null) : null,
    })),
    earlier: rows.length > limit ? encodeCommentCursor(page[0]!) : null,
  };
}

/** `@Name` tokens in a comment that match a member's display name → their user ids. */
export function parseMentions(body: string, members: { userId: string; displayName: string }[]) {
  const ids = new Set<string>();
  let rest = body;
  // Longest names first, and each match is removed, so "@Ann Lee" does not also mention "Ann".
  for (const m of [...members].sort((a, b) => b.displayName.length - a.displayName.length)) {
    const name = m.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)@${name}(?=$|[\\s.,!?:;])`, "gi");
    if (re.test(rest)) {
      ids.add(m.userId);
      rest = rest.replace(re, "$1");
    }
  }
  return [...ids];
}

export async function addComment(
  ws: Pick<Workspace, "id" | "slug" | "settings">,
  task: Task,
  authorId: string,
  body: string,
  opts: { mentions: boolean },
) {
  const text = body.trim().slice(0, 4000);
  if (!text) return null;
  const members = await listProfiles(ws.id);
  const mentions = opts.mentions
    ? parseMentions(text, members).filter((id) => id !== authorId)
    : [];
  const [c] = await db()
    .insert(schema.taskComments)
    .values({ workspaceId: ws.id, taskId: task.id, authorId, body: text, mentions })
    .returning();
  const author = members.find((m) => m.userId === authorId)?.displayName ?? "A teammate";
  for (const userId of mentions)
    void notify(ws, userId, {
      kind: "task.mentioned",
      title: `${author} mentioned you on “${task.title}”`,
      body: text.slice(0, 160),
      link: `/admin/tasks?task=${task.id}`,
      dedupeKey: `comment:${c!.id}:${userId}`,
    });
  return { comment: c!, mentions };
}

/* ---------------- Views ---------------- */

export async function listViews(workspaceId: string, userId: string): Promise<TaskView[]> {
  return db()
    .select()
    .from(schema.taskViews)
    .where(
      and(
        eq(schema.taskViews.workspaceId, workspaceId),
        or(eq(schema.taskViews.userId, userId), isNull(schema.taskViews.userId)),
      ),
    )
    .orderBy(asc(schema.taskViews.name));
}

/** Keeps only the filter fields we know, with sane values. */
export function cleanFilters(f: Record<string, unknown>): TaskFilters {
  const out: TaskFilters = {};
  const str = (v: unknown) => (typeof v === "string" && v.length && v.length < 100 ? v : undefined);
  if (str(f.assignee)) out.assignee = str(f.assignee);
  if (["overdue", "today", "week", "none"].includes(f.due as string))
    out.due = f.due as TaskFilters["due"];
  if (str(f.contactId)) out.contactId = str(f.contactId);
  if (str(f.eventTypeId)) out.eventTypeId = str(f.eventTypeId);
  if (Array.isArray(f.statusIds))
    out.statusIds = f.statusIds.filter((s): s is string => typeof s === "string").slice(0, 20);
  if (f.showDone === true) out.showDone = true;
  return out;
}
