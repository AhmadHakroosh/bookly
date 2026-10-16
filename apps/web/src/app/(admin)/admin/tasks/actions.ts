"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, schema } from "@bookly/db";
import type { TaskFilters } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { addTask } from "@/server/capture";
import { hasFlag } from "@/server/flags";
import { hasFeature } from "@/server/limits";
import { notify } from "@/server/notifications";
import { getProfileByUser } from "@/server/scheduling";
import { isManager, requireStaff } from "@/server/session";
import {
  addComment,
  archiveStatus,
  cleanFilters,
  cleanStatus,
  columnPage,
  decodeColumnCursor,
  ensureStatuses,
  isMember,
  moveTask,
  statusSetProblem,
  syncDoneForStatus,
  updateTask,
  type BoardTask,
} from "@/server/tasks";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * Everything the task board writes. Every action checks the `task_board` flag and the plan:
 * the list and "done" toggles are on every plan, the board (moves, statuses, saved views) needs
 * `taskBoard`, and giving tasks to teammates, @-mentions and shared views need `taskAssignment`.
 */

async function ctx() {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "task_board"))) return null;
  return {
    ws,
    user: session.user,
    manager: isManager(role),
    board: hasFeature(ws, "taskBoard"),
    assign: hasFeature(ws, "taskAssignment"),
  };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof ctx>>>;

export type ActionResult = { ok?: boolean; error?: string };

/** A task the member may see: everyone's with assignment (Team), otherwise their own. */
async function visibleTask(c: Ctx, id: string) {
  const t = await db().query.tasks.findFirst({
    where: and(eq(schema.tasks.id, id), eq(schema.tasks.workspaceId, c.ws.id)),
  });
  if (!t) return null;
  return c.assign || t.userId === c.user.id ? t : null;
}

const refresh = () => revalidatePath("/admin/tasks");

/* ---------------- Tasks ---------------- */

export async function createTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { error: "Tasks are not enabled for this workspace." };
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the task a title." };
  const due = String(formData.get("dueAt") ?? "");
  const raw = String(formData.get("assignee") ?? "");
  const wanted = raw && raw !== "me" ? raw : c.user.id;
  const userId = c.assign && (await isMember(c.ws.id, wanted)) ? wanted : c.user.id;
  const statuses = await ensureStatuses(c.ws.id);
  const statusParam = String(formData.get("statusId") ?? "");
  const statusId = c.board && statuses.some((s) => s.id === statusParam) ? statusParam : null;
  const t = await addTask(c.ws.id, {
    userId,
    title,
    dueAt: due ? new Date(due) : null,
    description: String(formData.get("description") ?? "") || null,
    statusId,
    assignedBy: c.user.id,
  });
  await audit({
    action: "task.created",
    target: { type: "task", id: t.id, label: t.title },
    changes: diff(null, { dueAt: t.dueAt, userId: t.userId, statusId: t.statusId }),
  });
  refresh();
  return { ok: true };
}

/**
 * A drag on the board: into `statusId`, between `prevId` and `nextId` (the cards that end up
 * above and below it).
 */
export async function moveTaskAction(
  taskId: string,
  statusId: string,
  prevId: string | null,
  nextId: string | null,
): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { error: "Tasks are not enabled for this workspace." };
  if (!c.board) return { error: "The board comes with Pro." };
  if (!(await visibleTask(c, taskId))) return { error: "That task is not yours to move." };
  const r = await moveTask(c.ws.id, taskId, statusId, prevId, nextId);
  if (!r) return { error: "That column no longer exists. Reload the board." };
  await audit({
    action: "task.moved",
    target: { type: "task", id: taskId, label: r.after.title },
    changes:
      r.from?.id !== r.to.id
        ? { status: { from: r.from?.name ?? null, to: r.to.name } }
        : { position: { to: "reordered" } },
  });
  refresh();
  return { ok: true };
}

/** The task pane's form: title, description, due date, assignee and status. */
export async function updateTaskAction(
  taskId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { error: "Tasks are not enabled for this workspace." };
  const t = await visibleTask(c, taskId);
  if (!t) return { error: "That task is not yours to edit." };
  const due = formData.get("dueAt");
  const assignee = String(formData.get("assignee") ?? "");
  const patch = {
    title: formData.has("title") ? String(formData.get("title")) : undefined,
    description: formData.has("description") ? String(formData.get("description")) : undefined,
    dueAt: due === null ? undefined : due ? new Date(String(due)) : null,
    userId:
      c.assign && assignee && assignee !== t.userId && (await isMember(c.ws.id, assignee))
        ? assignee
        : undefined,
  };
  const r = await updateTask(c.ws.id, taskId, patch);
  if (!r) return { error: "That task is gone." };
  let statusChange: { from: string | null; to: string } | null = null;
  const statusId = String(formData.get("statusId") ?? "");
  if (statusId && statusId !== t.statusId && c.board) {
    const moved = await moveTask(c.ws.id, taskId, statusId, null, null);
    if (moved) statusChange = { from: moved.from?.name ?? null, to: moved.to.name };
  }
  const changes = {
    ...diff(
      {
        title: r.before.title,
        description: r.before.description,
        dueAt: r.before.dueAt,
        userId: r.before.userId,
      },
      {
        title: r.after.title,
        description: r.after.description,
        dueAt: r.after.dueAt,
        userId: r.after.userId,
      },
    ),
    ...(statusChange ? { status: statusChange } : {}),
  };
  if (Object.keys(changes).length)
    await audit({
      action: "task.updated",
      target: { type: "task", id: taskId, label: r.after.title },
      changes,
    });
  if (patch.userId && patch.userId !== c.user.id) {
    const by = await getProfileByUser(c.ws.id, c.user.id);
    void notify(c.ws, patch.userId, {
      kind: "task.assigned",
      title: `${by?.displayName ?? "A teammate"} gave you a task`,
      body: r.after.title,
      link: `/admin/tasks?task=${taskId}`,
      dedupeKey: `task:${taskId}:assigned:${patch.userId}:${Date.now()}`,
    });
  }
  refresh();
  return { ok: true };
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { error: "Tasks are not enabled for this workspace." };
  const t = await visibleTask(c, taskId);
  if (!t) return { error: "That task is not yours to delete." };
  await db().delete(schema.tasks).where(eq(schema.tasks.id, t.id));
  await audit({ action: "task.deleted", target: { type: "task", id: t.id, label: t.title } });
  refresh();
  return { ok: true };
}

export async function addCommentAction(
  taskId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { error: "Tasks are not enabled for this workspace." };
  const t = await visibleTask(c, taskId);
  if (!t) return { error: "That task is gone." };
  const r = await addComment(c.ws, t, c.user.id, String(formData.get("body") ?? ""), {
    mentions: c.assign,
  });
  if (!r) return { error: "Write something first." };
  await audit({
    action: "task.commented",
    target: { type: "task", id: t.id, label: t.title },
    changes: { mentions: { to: r.mentions.length } },
  });
  refresh();
  return { ok: true };
}

/** "Show more" in one column of the board. */
export async function loadColumnAction(
  statusId: string,
  cursor: string,
  filters: TaskFilters,
): Promise<{ rows: BoardTask[]; next: string | null } | null> {
  // audit: read-only — the next page of one board column
  const c = await ctx();
  if (!c || !c.board) return null;
  const statuses = await ensureStatuses(c.ws.id);
  const status = statuses.find((s) => s.id === statusId);
  if (!status) return null;
  const profile = await getProfileByUser(c.ws.id, c.user.id);
  const f = cleanFilters(filters as Record<string, unknown>);
  if (!c.assign) f.assignee = "me";
  return columnPage(
    status,
    f,
    { workspaceId: c.ws.id, viewerId: c.user.id, tz: profile?.timezone ?? c.ws.timezone },
    decodeColumnCursor(cursor),
  );
}

/* ---------------- Statuses (owners and admins, Pro and up) ---------------- */

async function statusCtx() {
  const c = await ctx();
  if (!c) return { error: "Tasks are not enabled for this workspace." } as const;
  if (!c.board) return { error: "Custom statuses come with Pro." } as const;
  if (!c.manager) return { error: "Only owners and admins edit statuses." } as const;
  return { c, statuses: await ensureStatuses(c.ws.id) } as const;
}

const statusLabel = (s: { id: string; name: string }) => ({
  type: "task_status",
  id: s.id,
  label: s.name,
});

export async function createStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sc = await statusCtx();
  if ("error" in sc) return { error: sc.error };
  const clean = cleanStatus({
    name: String(formData.get("name") ?? ""),
    color: String(formData.get("color") || "#71717a"),
    isDone: formData.get("isDone") === "on",
  });
  if (typeof clean === "string") return { error: clean };
  const proposed = [
    ...sc.statuses,
    { name: clean.name!, isDone: !!clean.isDone, isDefault: false },
  ];
  const problem = statusSetProblem(proposed);
  if (problem) return { error: problem };
  if (sc.statuses.length >= 20) return { error: "Twenty statuses is the most a board can have." };
  // A new done column goes last; a new open column goes before the first done one.
  const firstDone = sc.statuses.findIndex((s) => s.isDone);
  const at = clean.isDone || firstDone < 0 ? sc.statuses.length : firstDone;
  const ordered = [
    ...sc.statuses.slice(0, at).map((s) => s.id),
    "new",
    ...sc.statuses.slice(at).map((s) => s.id),
  ];
  const [row] = await db()
    .insert(schema.taskStatuses)
    .values({
      workspaceId: sc.c.ws.id,
      name: clean.name!,
      color: clean.color ?? "#71717a",
      isDone: !!clean.isDone,
      position: at,
    })
    .returning();
  await reorder(
    sc.c.ws.id,
    ordered.map((id) => (id === "new" ? row!.id : id)),
  );
  await audit({
    action: "task_status.created",
    target: statusLabel(row!),
    changes: diff(null, { name: row!.name, color: row!.color, isDone: row!.isDone }),
  });
  refresh();
  return { ok: true };
}

export async function updateStatusAction(
  statusId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sc = await statusCtx();
  if ("error" in sc) return { error: sc.error };
  const before = sc.statuses.find((s) => s.id === statusId);
  if (!before) return { error: "That status is gone." };
  const wip = String(formData.get("wipLimit") ?? "").trim();
  const clean = cleanStatus({
    name: String(formData.get("name") ?? before.name),
    color: String(formData.get("color") || before.color),
    isDone: formData.get("isDone") === "on",
    wipLimit: wip ? Number(wip) : null,
  });
  if (typeof clean === "string") return { error: clean };
  const makeDefault = formData.get("isDefault") === "on";
  const proposed = sc.statuses.map((s) =>
    s.id === statusId
      ? {
          name: clean.name!,
          isDone: !!clean.isDone,
          isDefault: makeDefault || (s.isDefault && !clean.isDone),
        }
      : { name: s.name, isDone: s.isDone, isDefault: makeDefault ? false : s.isDefault },
  );
  const problem = statusSetProblem(proposed);
  if (problem) return { error: problem };
  if (makeDefault)
    await db()
      .update(schema.taskStatuses)
      .set({ isDefault: false })
      .where(
        and(
          eq(schema.taskStatuses.workspaceId, sc.c.ws.id),
          isNull(schema.taskStatuses.archivedAt),
        ),
      );
  const [after] = await db()
    .update(schema.taskStatuses)
    .set({ ...clean, isDefault: makeDefault || (before.isDefault && !clean.isDone) })
    .where(eq(schema.taskStatuses.id, statusId))
    .returning();
  if (after!.isDone !== before.isDone) await syncDoneForStatus(sc.c.ws.id, statusId, after!.isDone);
  const pick = (s: typeof before) => ({
    name: s.name,
    color: s.color,
    isDone: s.isDone,
    isDefault: s.isDefault,
    wipLimit: s.wipLimit,
  });
  await audit({
    action: "task_status.updated",
    target: statusLabel(after!),
    changes: diff(pick(before), pick(after!)),
  });
  refresh();
  return { ok: true };
}

async function reorder(workspaceId: string, ids: string[]) {
  for (const [position, id] of ids.entries())
    await db()
      .update(schema.taskStatuses)
      .set({ position })
      .where(and(eq(schema.taskStatuses.id, id), eq(schema.taskStatuses.workspaceId, workspaceId)));
}

/** New column order (the editor's up / down buttons, or a drag of a column). */
export async function reorderStatusesAction(ids: string[]): Promise<ActionResult> {
  const sc = await statusCtx();
  if ("error" in sc) return { error: sc.error };
  const known = new Set(sc.statuses.map((s) => s.id));
  if (ids.length !== known.size || !ids.every((id) => known.has(id)))
    return { error: "The statuses changed meanwhile. Reload and try again." };
  await reorder(sc.c.ws.id, ids);
  const name = new Map(sc.statuses.map((s) => [s.id, s.name]));
  await audit({
    action: "task_status.reordered",
    target: { type: "task_status", id: ids[0]!, label: "Board columns" },
    changes: {
      order: {
        from: sc.statuses.map((s) => s.name).join(" → "),
        to: ids.map((id) => name.get(id)).join(" → "),
      },
    },
  });
  refresh();
  return { ok: true };
}

/** Archives a status after moving its tasks into another one. */
export async function archiveStatusAction(statusId: string, intoId: string): Promise<ActionResult> {
  const sc = await statusCtx();
  if ("error" in sc) return { error: sc.error };
  const status = sc.statuses.find((s) => s.id === statusId);
  const into = sc.statuses.find((s) => s.id === intoId && s.id !== statusId);
  if (!status || !into) return { error: "Pick where its tasks go." };
  const rest = sc.statuses.filter((s) => s.id !== statusId);
  // Archiving the default passes the role to the column its tasks move into (if open).
  const proposed = rest.map((s) => ({
    name: s.name,
    isDone: s.isDone,
    isDefault: status.isDefault ? s.id === into.id : s.isDefault,
  }));
  const problem = statusSetProblem(proposed);
  if (problem) return { error: problem };
  if (status.isDefault)
    await db()
      .update(schema.taskStatuses)
      .set({ isDefault: true })
      .where(eq(schema.taskStatuses.id, into.id));
  const moved = await archiveStatus(sc.c.ws.id, statusId, into.id);
  await audit({
    action: "task_status.archived",
    target: statusLabel(status),
    changes: { tasksMovedTo: { to: into.name }, tasks: { to: moved } },
  });
  refresh();
  return { ok: true };
}

/* ---------------- Saved views ---------------- */

export async function saveViewAction(
  name: string,
  layout: "board" | "list",
  filters: TaskFilters,
  shared: boolean,
): Promise<ActionResult & { id?: string }> {
  const c = await ctx();
  if (!c) return { error: "Tasks are not enabled for this workspace." };
  if (!c.board) return { error: "Saved views come with Pro." };
  if (shared && !c.assign) return { error: "Views for the whole workspace come with Team." };
  const clean = name.trim().slice(0, 60);
  if (!clean) return { error: "Name the view." };
  const [v] = await db()
    .insert(schema.taskViews)
    .values({
      workspaceId: c.ws.id,
      userId: shared ? null : c.user.id,
      name: clean,
      layout: layout === "list" ? "list" : "board",
      filters: cleanFilters(filters as Record<string, unknown>),
      createdBy: c.user.id,
    })
    .returning();
  await audit({
    action: "task_view.created",
    target: { type: "task_view", id: v!.id, label: v!.name },
    changes: { shared: { to: shared }, layout: { to: v!.layout } },
  });
  refresh();
  return { ok: true, id: v!.id };
}

export async function deleteViewAction(viewId: string): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { error: "Tasks are not enabled for this workspace." };
  const v = await db().query.taskViews.findFirst({
    where: and(eq(schema.taskViews.id, viewId), eq(schema.taskViews.workspaceId, c.ws.id)),
  });
  if (!v) return { error: "That view is gone." };
  const mine =
    v.userId === c.user.id || (v.userId === null && (v.createdBy === c.user.id || c.manager));
  if (!mine) return { error: "Only its creator or an admin can delete a shared view." };
  await db().delete(schema.taskViews).where(eq(schema.taskViews.id, v.id));
  await audit({
    action: "task_view.deleted",
    target: { type: "task_view", id: v.id, label: v.name },
  });
  refresh();
  return { ok: true };
}
