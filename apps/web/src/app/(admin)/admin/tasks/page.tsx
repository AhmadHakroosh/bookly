import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PaneHost } from "@/components/pane";
import { TaskToggleButton } from "@/components/task-buttons";
import { PLANS, planFor } from "@bookly/cloud";
import { and, eq, schema, sql } from "@bookly/db";
import type { TaskFilters } from "@bookly/db/schema";
import { BetaBadge } from "@/components/beta-badge";
import { TasksSkeleton } from "@/components/skeletons/pages";
import { db } from "@/lib/db";
import { cardOf } from "@/lib/task-card";
import {
  BUILTIN_VIEWS,
  TASKS_LAYOUT_COOKIE,
  TASKS_VIEW_COOKIE,
  filtersFromParams,
  isBuiltinView,
  paramsFromFilters,
  type TasksLayout,
} from "@/lib/tasks-view";
import { fmtDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { hasFlag, inBeta } from "@/server/flags";
import { hasFeature } from "@/server/limits";
import { getProfileByUser, listAllEventTypes, listProfiles } from "@/server/scheduling";
import { isManager, requireStaff } from "@/server/session";
import {
  board,
  decodeCommentCursor,
  decodeListCursor,
  ensureStatuses,
  getBoardTask,
  listComments,
  listPage,
  listViews,
  taskContacts,
  type FilterCtx,
} from "@/server/tasks";
import { getCurrentWorkspace } from "@/server/workspace";
import { toggleTask } from "../scheduling-actions";
import { Board, type Column } from "./board";
import { StatusEditor } from "./status-editor";
import { TaskFiles } from "./task-files";
import { taskFiles } from "@/server/drive";
import { CommentForm, DeleteTaskButton, NewTaskButton, TaskEditForm, TaskPane } from "./task-forms";
import { TasksToolbar } from "./toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";

export const metadata = { title: "Tasks" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

async function TasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  const [{ session, role }, ws, sp, jar] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams as Promise<SP>,
    cookies(),
  ]);
  if (!ws) return null;
  if (!(await hasFlag(ws, "task_board"))) redirect("/admin#tasks");
  const userId = session.user.id;
  const manager = isManager(role);
  const canBoard = hasFeature(ws, "taskBoard");
  const canAssign = hasFeature(ws, "taskAssignment");
  const [profile, statuses, people, beta] = await Promise.all([
    getProfileByUser(ws.id, userId),
    ensureStatuses(ws.id),
    listProfiles(ws.id),
    inBeta(ws, "task_board"),
  ]);
  const tz = profile?.timezone ?? ws.timezone;
  const views = canBoard ? await listViews(ws.id, userId) : [];

  // Which view: the URL, else the last one used, else "mine" for members and "all" for managers.
  const urlFilters = filtersFromParams(sp);
  const cookieView = jar.get(TASKS_VIEW_COOKIE)?.value;
  const known = (v: string | undefined) =>
    !!v && ((isBuiltinView(v) && (v !== "all" || canAssign)) || views.some((x) => x.id === v));
  const viewId = urlFilters
    ? ""
    : known(one(sp.view))
      ? one(sp.view)!
      : known(cookieView)
        ? cookieView!
        : manager && canAssign
          ? "all"
          : "mine";
  const saved = views.find((v) => v.id === viewId);
  let filters: TaskFilters =
    urlFilters ??
    (saved ? saved.filters : isBuiltinView(viewId) ? BUILTIN_VIEWS[viewId].filters : {});
  // Without assignment (Free and Pro) every member sees only their own tasks.
  if (!canAssign) filters = { ...filters, assignee: "me" };

  const layoutParam = one(sp.layout);
  const cookieLayout = jar.get(TASKS_LAYOUT_COOKIE)?.value;
  const layout: TasksLayout = !canBoard
    ? "list"
    : layoutParam === "board" || layoutParam === "list"
      ? layoutParam
      : (saved?.layout ?? (cookieLayout === "board" ? "board" : "list"));

  const ctx: FilterCtx = { workspaceId: ws.id, viewerId: userId, tz };
  const names = Object.fromEntries(people.map((p) => [p.userId, p.displayName]));
  const current: Record<string, string | null> = {
    ...(urlFilters ? paramsFromFilters(urlFilters) : { view: viewId }),
    layout: layoutParam ? layout : null,
  };
  const hrefFor = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/tasks${s ? `?${s}` : ""}`;
  };
  const taskId = one(sp.task);
  const t = schema.tasks;
  const [contacts, eventTypes, [counts]] = await Promise.all([
    taskContacts(ws.id),
    listAllEventTypes(ws.id),
    db()
      .select({
        mine: sql<number>`count(*) filter (where ${t.doneAt} is null and ${t.userId} = ${userId})::int`,
        all: sql<number>`count(*) filter (where ${t.doneAt} is null)::int`,
        completed: canAssign
          ? sql<number>`count(*) filter (where ${t.doneAt} is not null)::int`
          : sql<number>`count(*) filter (where ${t.doneAt} is not null and ${t.userId} = ${userId})::int`,
      })
      .from(t)
      .where(eq(t.workspaceId, ws.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        badge={beta && <BetaBadge />}
        description={<>Follow-ups from your meetings and everything else on your plate.</>}
        actions={
          <>
            {manager && canBoard && (
              <Suspense fallback={null}>
                <StatusesButton workspaceId={ws.id} />
              </Suspense>
            )}
            <NewTaskButton
              statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
              people={people.map((p) => ({ id: p.userId, name: p.displayName }))}
              canBoard={canBoard}
              canAssign={canAssign}
              defaultOpen={one(sp.new) === "1"}
            />
          </>
        }
      />

      <TasksToolbar
        layout={layout}
        canBoard={canBoard}
        canAssign={canAssign}
        view={viewId}
        views={views.map((v) => ({
          id: v.id,
          name: v.name,
          shared: v.userId === null,
          deletable:
            v.userId === userId || (v.userId === null && (v.createdBy === userId || manager)),
        }))}
        filters={canAssign ? filters : { ...filters, assignee: undefined }}
        people={people.map((p) => ({ id: p.userId, name: p.displayName }))}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name || c.email }))}
        eventTypes={eventTypes.map((e) => ({ id: e.id, name: e.title }))}
        proName={PLANS[planFor("taskBoard")].name}
        teamName={PLANS[planFor("taskAssignment")].name}
        counts={counts ?? { mine: 0, all: 0, completed: 0 }}
        doneStatusIds={statuses.filter((st) => st.isDone).map((st) => st.id)}
      />

      {layout === "board" ? (
        <BoardSection
          statuses={statuses}
          filters={filters}
          ctx={ctx}
          tz={tz}
          names={names}
          taskHref={hrefFor({ task: null })}
          showAssignee={canAssign}
        />
      ) : (
        <ListSection
          filters={filters}
          ctx={ctx}
          tz={tz}
          names={names}
          statuses={statuses}
          cursor={one(sp.after)}
          hrefFor={hrefFor}
          showAssignee={canAssign}
          selected={taskId ?? null}
        />
      )}

      <PaneHost param="task" id={taskId ?? null} label="Task">
        {taskId && (
          <TaskDetail
            workspaceId={ws.id}
            taskId={taskId}
            viewerId={userId}
            tz={tz}
            canBoard={canBoard}
            canAssign={canAssign}
            closeHref={hrefFor({ task: null })}
            commentsBefore={one(sp.before)}
            earlierHref={(cursor) => hrefFor({ task: taskId, before: cursor })}
          />
        )}
      </PaneHost>
    </div>
  );
}

async function StatusesButton({ workspaceId }: { workspaceId: string }) {
  const [statuses, counts] = await Promise.all([
    ensureStatuses(workspaceId),
    db()
      .select({ statusId: schema.tasks.statusId, n: sql<number>`count(*)::int` })
      .from(schema.tasks)
      .where(eq(schema.tasks.workspaceId, workspaceId))
      .groupBy(schema.tasks.statusId),
  ]);
  const n = new Map(counts.map((c) => [c.statusId, c.n]));
  return (
    <StatusEditor
      statuses={statuses.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        isDone: s.isDone,
        isDefault: s.isDefault,
        wipLimit: s.wipLimit,
        count: n.get(s.id) ?? 0,
      }))}
    />
  );
}

async function BoardSection({
  statuses,
  filters,
  ctx,
  tz,
  names,
  taskHref,
  showAssignee,
}: {
  statuses: Awaited<ReturnType<typeof ensureStatuses>>;
  filters: TaskFilters;
  ctx: FilterCtx;
  tz: string;
  names: Record<string, string>;
  taskHref: string;
  showAssignee: boolean;
}) {
  const cols = await board(statuses, filters, ctx);
  const columns: Column[] = cols.map((c) => ({
    status: {
      id: c.status.id,
      name: c.status.name,
      color: c.status.color,
      isDone: c.status.isDone,
      wipLimit: c.status.wipLimit,
    },
    total: c.total,
    tasks: c.rows.map((r) => cardOf(r, tz, names)),
    next: c.next,
  }));
  // The board keeps its own state while dragging; any change from the server (a move, a new
  // comment, an edit) gives it a new key so it starts from the fresh data.
  const json = JSON.stringify(columns);
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  const version = `${columns.length}:${h}`;
  return (
    <Board
      key={version}
      columns={columns}
      filters={filters}
      hrefFor={taskHref}
      showAssignee={showAssignee}
      tz={tz}
      people={names}
    />
  );
}

async function ListSection({
  filters,
  ctx,
  tz,
  names,
  statuses,
  cursor,
  hrefFor,
  showAssignee,
  selected,
}: {
  filters: TaskFilters;
  ctx: FilterCtx;
  tz: string;
  names: Record<string, string>;
  statuses: Awaited<ReturnType<typeof ensureStatuses>>;
  cursor: string | undefined;
  hrefFor: (patch: Record<string, string | null>) => string;
  showAssignee: boolean;
  /** The task open in the pane. */
  selected: string | null;
}) {
  const { rows, next } = await listPage(filters, ctx, decodeListCursor(cursor));
  const status = new Map(statuses.map((s) => [s.id, s]));
  return (
    <section aria-label="Task list" className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {cursor
            ? "No more tasks."
            : "Nothing here. New tasks from your meeting recaps land here too."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="w-12 py-2.5 ps-3">
                  <span className="sr-only">Done</span>
                </th>
                <th scope="col" className="py-2.5 font-medium">
                  Task
                </th>
                {showAssignee && (
                  <th scope="col" className="hidden w-48 py-2.5 font-medium md:table-cell">
                    Assignee
                  </th>
                )}
                <th scope="col" className="w-32 py-2.5 font-medium">
                  Due date
                </th>
                <th
                  scope="col"
                  className="hidden w-44 py-2.5 pe-3 font-medium sm:table-cell lg:w-52"
                >
                  Contact
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const card = cardOf(r, tz, names);
                const s = r.statusId ? status.get(r.statusId) : undefined;
                const today = card.due === "Today";
                return (
                  <tr
                    key={r.id}
                    className={cn("hover:bg-muted/40", selected === r.id && "bg-accent")}
                  >
                    <td className="py-2.5 ps-3 align-middle">
                      <form action={toggleTask.bind(null, r.id, !card.done, "/admin/tasks")}>
                        <TaskToggleButton
                          label={`${card.done ? "Reopen" : "Mark done"}: ${r.title}`}
                          done={card.done}
                        />
                      </form>
                    </td>
                    <td className="py-2.5 pe-3">
                      <Link
                        href={hrefFor({ task: r.id })}
                        scroll={false}
                        className={cn(
                          "block truncate font-medium hover:underline",
                          card.done && "text-muted-foreground line-through",
                        )}
                      >
                        {r.title}
                      </Link>
                      {s && (
                        <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className="size-2 rounded-full"
                            style={{ background: s.color }}
                            aria-hidden
                          />
                          {s.name}
                        </span>
                      )}
                    </td>
                    {showAssignee && (
                      <td className="hidden py-2.5 pe-3 md:table-cell">
                        {card.assignee ? (
                          <span className="inline-flex items-center gap-2">
                            <Avatar size="sm" aria-hidden>
                              <AvatarFallback className="bg-accent text-[10px] font-semibold text-accent-foreground">
                                {initialsOf(card.assignee)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-muted-foreground">{card.assignee}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-2.5 pe-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "tabular-nums",
                          card.overdue || today
                            ? "font-medium text-warning"
                            : "text-muted-foreground",
                        )}
                      >
                        {card.due ?? "—"}
                        {card.overdue && <span className="sr-only"> (overdue)</span>}
                      </span>
                    </td>
                    <td className="hidden py-2.5 pe-3 sm:table-cell">
                      {r.contactId && card.contact ? (
                        <Link
                          href={`/admin/contacts/${r.contactId}`}
                          className="block truncate text-primary hover:underline"
                        >
                          {card.contact}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-2">
        {cursor && (
          <Link
            href={hrefFor({ after: null })}
            scroll={false}
            className="text-sm underline underline-offset-4"
          >
            Back to the start
          </Link>
        )}
        {next && (
          <Link
            href={hrefFor({ after: next })}
            scroll={false}
            className="ml-auto text-sm underline underline-offset-4"
          >
            Show more
          </Link>
        )}
      </div>
    </section>
  );
}

async function TaskDetail({
  workspaceId,
  taskId,
  viewerId,
  tz,
  canBoard,
  canAssign,
  closeHref,
  commentsBefore,
  earlierHref,
}: {
  workspaceId: string;
  taskId: string;
  viewerId: string;
  tz: string;
  canBoard: boolean;
  canAssign: boolean;
  closeHref: string;
  /** Cursor from "Show earlier comments". */
  commentsBefore?: string;
  earlierHref: (cursor: string) => string;
}) {
  const t = await getBoardTask(workspaceId, taskId);
  if (!t || (!canAssign && t.userId !== viewerId))
    return (
      <TaskPane title="Task not found" closeHref={closeHref}>
        <p className="text-sm text-muted-foreground">This task was deleted or is not yours.</p>
      </TaskPane>
    );
  const ws = await getCurrentWorkspace();
  const filesOn = !!ws && (await hasFlag(ws, "files")) && hasFeature(ws, "attachments");
  const [statuses, people, comments, booking, files] = await Promise.all([
    ensureStatuses(workspaceId),
    listProfiles(workspaceId),
    listComments(workspaceId, taskId, { before: decodeCommentCursor(commentsBefore) }),
    t.bookingId
      ? db().query.bookings.findFirst({
          where: and(
            eq(schema.bookings.id, t.bookingId),
            eq(schema.bookings.workspaceId, workspaceId),
          ),
          columns: { id: true, attendeeName: true, startAt: true },
        })
      : null,
    filesOn && ws ? taskFiles({ userId: viewerId, ws }, taskId) : Promise.resolve([]),
  ]);
  const name = new Map(people.map((p) => [p.userId, p.displayName]));
  const others = people
    .filter((p) => p.userId !== viewerId)
    .map((p) => ({ id: p.userId, name: p.displayName }));
  return (
    <TaskPane title={t.title} closeHref={closeHref}>
      <div className="space-y-6">
        <div className="flex items-start gap-3 pe-8">
          <form action={toggleTask.bind(null, t.id, !t.doneAt, "/admin/tasks")} className="pt-1">
            <TaskToggleButton
              label={`${t.doneAt ? "Reopen" : "Mark done"}: ${t.title}`}
              done={!!t.doneAt}
            />
          </form>
          <div className="min-w-0 space-y-1">
            <h1
              className={cn(
                "text-lg font-semibold tracking-tight break-words",
                t.doneAt && "text-muted-foreground line-through",
              )}
            >
              {t.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t.createdBy && t.createdBy !== t.userId
                ? `${name.get(t.createdBy) ?? "A teammate"} gave this to ${name.get(t.userId) ?? "someone"}`
                : `Created by ${name.get(t.createdBy ?? t.userId) ?? "you"}`}{" "}
              on {fmtDateTime(t.createdAt, tz)}
            </p>
          </div>
        </div>
        <TaskEditForm
          key={`${t.id}:${t.updatedAt.getTime()}`}
          taskId={t.id}
          title={t.title}
          description={t.description ?? ""}
          dueAt={t.dueAt ? t.dueAt.toISOString().slice(0, 10) : null}
          statusId={t.statusId}
          assignee={t.userId}
          statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
          people={people.map((p) => ({ id: p.userId, name: p.displayName }))}
          canBoard={canBoard}
          canAssign={canAssign}
          links={[
            ...(t.contactId
              ? [
                  {
                    label: "Contact",
                    href: `/admin/contacts/${t.contactId}`,
                    text: t.contactName ?? "Contact",
                  },
                ]
              : []),
            ...(booking
              ? [
                  {
                    label: "Meeting",
                    href: `/admin/bookings/${booking.id}`,
                    text: `${t.bookingTitle ?? "Meeting"} with ${booking.attendeeName}, ${fmtDateTime(booking.startAt, tz)}`,
                  },
                ]
              : []),
          ]}
        />
        {filesOn && (
          <TaskFiles
            taskId={t.id}
            contactId={t.contactId}
            files={files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size }))}
          />
        )}
        <section aria-labelledby="comments-heading" className="space-y-3 border-t pt-5">
          <h2 id="comments-heading" className="text-base font-semibold tracking-tight">
            Comments
          </h2>
          {comments.earlier && (
            <Link
              href={earlierHref(comments.earlier)}
              scroll={false}
              className="text-sm underline underline-offset-4"
            >
              Show earlier comments
            </Link>
          )}
          {comments.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            <ol className="space-y-3">
              {comments.rows.map((c) => (
                <li key={c.id} className="text-sm">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.authorName ?? "Someone"}</span>{" "}
                    · {fmtDateTime(c.createdAt, tz)}
                  </p>
                  <p className="whitespace-pre-line">{c.body}</p>
                </li>
              ))}
            </ol>
          )}
          <CommentForm key={comments.rows.length} taskId={t.id} people={canAssign ? others : []} />
        </section>
        <div className="border-t pt-4">
          <DeleteTaskButton taskId={t.id} closeHref={closeHref} />
        </div>
      </div>
    </TaskPane>
  );
}

export default function TasksPageBoundary(props: PageProps<"/admin/tasks">) {
  return (
    <Suspense fallback={<TasksSkeleton />}>
      <TasksPage {...props} />
    </Suspense>
  );
}
