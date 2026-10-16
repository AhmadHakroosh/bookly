import type { TaskFilters } from "@bookly/db/schema";

/*
 * The task page's address: layout, view and filters live in the URL so every view can be linked
 * and the back button works. Shared by the server page and the client toolbar.
 */

export const TASKS_LAYOUT_COOKIE = "bookly-tasks-layout";
export const TASKS_VIEW_COOKIE = "bookly-tasks-view";

export type TasksLayout = "board" | "list";

/** Built-in views every member has. */
export const BUILTIN_VIEWS = {
  mine: { name: "My tasks", filters: { assignee: "me" } as TaskFilters },
  all: { name: "Everyone's tasks", filters: {} as TaskFilters },
} as const;
export type BuiltinView = keyof typeof BUILTIN_VIEWS;
export const isBuiltinView = (v: unknown): v is BuiltinView => v === "mine" || v === "all";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Filters written in the URL, or null when it names none. */
export function filtersFromParams(sp: Params): TaskFilters | null {
  const f: TaskFilters = {};
  const assignee = one(sp.assignee);
  if (assignee) f.assignee = assignee;
  const due = one(sp.due);
  if (due === "overdue" || due === "today" || due === "week" || due === "none") f.due = due;
  if (one(sp.contact)) f.contactId = one(sp.contact);
  if (one(sp.eventType)) f.eventTypeId = one(sp.eventType);
  const status = one(sp.status);
  if (status) f.statusIds = status.split(",").filter(Boolean).slice(0, 20);
  if (one(sp.done) === "1") f.showDone = true;
  return Object.keys(f).length ? f : null;
}

/** The URL parameters for a set of filters (the inverse of `filtersFromParams`). */
export function paramsFromFilters(f: TaskFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.assignee) out.assignee = f.assignee;
  if (f.due) out.due = f.due;
  if (f.contactId) out.contact = f.contactId;
  if (f.eventTypeId) out.eventType = f.eventTypeId;
  if (f.statusIds?.length) out.status = f.statusIds.join(",");
  if (f.showDone) out.done = "1";
  return out;
}

export const FILTER_KEYS = ["assignee", "due", "contact", "eventType", "status", "done"] as const;

export const DUE_LABELS: Record<NonNullable<TaskFilters["due"]>, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "Due this week",
  none: "No due date",
};
