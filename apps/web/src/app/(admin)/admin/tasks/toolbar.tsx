"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BookmarkPlusIcon,
  KanbanSquareIcon,
  ListIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { TaskFilters } from "@bookly/db/schema";
import { Dropdown } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DUE_LABELS,
  FILTER_KEYS,
  TASKS_LAYOUT_COOKIE,
  TASKS_VIEW_COOKIE,
  paramsFromFilters,
  type TasksLayout,
} from "@/lib/tasks-view";
import { cn } from "@/lib/utils";
import { deleteViewAction, saveViewAction } from "./actions";

type Option = { id: string; name: string };

function remember(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/admin; max-age=31536000; samesite=lax`;
}

/**
 * Mine · All · Completed (`ui mocks.png` 05), saved views, the filters in one popover and the
 * list / board toggle. Every choice is a URL change (so it can be linked and the back
 * button works); the layout and the last view are remembered for the next visit.
 */
export function TasksToolbar({
  layout,
  canBoard,
  canAssign,
  view,
  views,
  filters,
  people,
  statuses,
  contacts,
  eventTypes,
  proName,
  teamName,
  counts,
  doneStatusIds,
}: {
  layout: TasksLayout;
  canBoard: boolean;
  canAssign: boolean;
  /** "mine", "all", a saved view id, or "" for unsaved filters. */
  view: string;
  views: (Option & { shared: boolean; deletable: boolean })[];
  filters: TaskFilters;
  people: Option[];
  statuses: Option[];
  contacts: Option[];
  eventTypes: Option[];
  proName: string;
  teamName: string;
  /** Open tasks assigned to me, open tasks of everyone, finished tasks: the tabs' counts. */
  counts: { mine: number; all: number; completed: number };
  /** The statuses that mean done: Completed shows tasks in them. */
  doneStatusIds: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [shared, setShared] = useState(false);

  const go = (patch: Record<string, string | null>, opts: { keepView?: boolean } = {}) => {
    const q = new URLSearchParams(sp.toString());
    q.delete("after");
    q.delete("task");
    if (!opts.keepView) q.delete("view");
    for (const [k, v] of Object.entries(patch))
      if (v) q.set(k, v);
      else q.delete(k);
    const s = q.toString();
    start(() => router.push(`${pathname}${s ? `?${s}` : ""}`, { scroll: false }));
  };

  const pickView = (v: string) => {
    remember(TASKS_VIEW_COOKIE, v);
    const q: Record<string, string | null> = Object.fromEntries(FILTER_KEYS.map((k) => [k, null]));
    go({ ...q, view: v, layout: null }, { keepView: true });
  };

  /** "any" is the dropdowns' "no filter" choice (the Select shows nothing for an empty value). */
  const setFilter = (key: string, value: string | null) =>
    go({ [key]: value && value !== "any" ? value : null });
  const active = Object.keys(paramsFromFilters(filters)).length > 0;

  const save = () =>
    start(async () => {
      const r = await saveViewAction(viewName, layout, filters, shared);
      if (r.error) return void toast.error(r.error);
      setSaveOpen(false);
      setViewName("");
      remember(TASKS_VIEW_COOKIE, r.id!);
      go(
        { ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), view: r.id! },
        { keepView: true },
      );
    });

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteViewAction(id);
      if (r.error) return void toast.error(r.error);
      remember(TASKS_VIEW_COOKIE, "mine");
      pickView("mine");
    });

  const saved = views.find((v) => v.id === view);
  const doneOnly =
    view === "" &&
    !!filters.showDone &&
    !!filters.statusIds?.length &&
    filters.statusIds.every((id) => doneStatusIds.includes(id));
  const showCompleted = () =>
    go({
      ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])),
      done: "1",
      status: doneStatusIds.join(","),
      ...(canAssign ? {} : { assignee: "me" }),
    });
  // How many filters are on, beyond what the tab itself means.
  const extra = Object.keys(paramsFromFilters(filters)).filter(
    (k) =>
      !(doneOnly && (k === "done" || k === "status")) &&
      !(view === "" && k === "assignee" && !canAssign),
  ).length;
  const tab = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      on
        ? "border-primary/40 bg-accent text-accent-foreground"
        : "bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Which tasks" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-current={view === "mine" ? "page" : undefined}
            onClick={() => pickView("mine")}
            className={tab(view === "mine")}
          >
            Mine <span className="tabular-nums">({counts.mine})</span>
          </button>
          {canAssign && (
            <button
              type="button"
              aria-current={view === "all" ? "page" : undefined}
              onClick={() => pickView("all")}
              className={tab(view === "all")}
            >
              All <span className="tabular-nums">({counts.all})</span>
            </button>
          )}
          <button
            type="button"
            aria-current={doneOnly ? "page" : undefined}
            onClick={showCompleted}
            className={tab(doneOnly)}
          >
            Completed <span className="tabular-nums">({counts.completed})</span>
          </button>
        </nav>
        {views.length > 0 && (
          <Dropdown
            ariaLabel="Saved views"
            size="sm"
            value={saved ? saved.id : "none"}
            onValueChange={(v) => v !== "none" && pickView(v)}
            options={[
              { value: "none", label: "Saved views" },
              ...views.map((v) => ({
                value: v.id,
                label: v.shared ? `${v.name} (shared)` : v.name,
              })),
            ]}
            className="w-44"
          />
        )}
        {saved?.deletable && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete the view ${saved.name}`}
            onClick={() => remove(saved.id)}
          >
            <Trash2Icon />
          </Button>
        )}

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {canBoard && view === "" && !doneOnly && (
            <Popover open={saveOpen} onOpenChange={setSaveOpen}>
              <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
                <BookmarkPlusIcon data-icon="inline-start" />
                Save view
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save();
                  }}
                >
                  <label className="block space-y-1 text-sm">
                    <span className="font-medium">Name</span>
                    <Input
                      value={viewName}
                      onChange={(e) => setViewName(e.target.value)}
                      placeholder="Overdue follow-ups"
                      autoFocus
                    />
                  </label>
                  {canAssign && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={shared}
                        onChange={(e) => setShared(e.target.checked)}
                      />
                      Share with the whole workspace
                    </label>
                  )}
                  <Button type="submit" disabled={pending || !viewName.trim()} className="w-full">
                    Save
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          )}
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <SlidersHorizontalIcon data-icon="inline-start" />
              Filters
              {extra > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground tabular-nums">
                  {extra}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="grid gap-2" role="group" aria-label="Filters">
                {canAssign && (
                  <Dropdown
                    ariaLabel="Assignee"
                    size="sm"
                    value={filters.assignee ?? "any"}
                    onValueChange={(v) => setFilter("assignee", v)}
                    options={[
                      { value: "any", label: "Anyone" },
                      { value: "me", label: "Me" },
                      ...people.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                )}
                <Dropdown
                  ariaLabel="Due"
                  size="sm"
                  value={filters.due ?? "any"}
                  onValueChange={(v) => setFilter("due", v)}
                  options={[
                    { value: "any", label: "Any due date" },
                    ...Object.entries(DUE_LABELS).map(([value, label]) => ({ value, label })),
                  ]}
                />
                <Dropdown
                  ariaLabel="Status"
                  size="sm"
                  value={filters.statusIds?.length === 1 ? filters.statusIds[0]! : "any"}
                  onValueChange={(v) => setFilter("status", v)}
                  options={[
                    { value: "any", label: "Any status" },
                    ...statuses.map((st) => ({ value: st.id, label: st.name })),
                  ]}
                />
                {contacts.length > 0 && (
                  <Dropdown
                    ariaLabel="Contact"
                    size="sm"
                    value={filters.contactId ?? "any"}
                    onValueChange={(v) => setFilter("contact", v)}
                    options={[
                      { value: "any", label: "Any contact" },
                      ...contacts.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                )}
                {eventTypes.length > 0 && (
                  <Dropdown
                    ariaLabel="Event type"
                    size="sm"
                    value={filters.eventTypeId ?? "any"}
                    onValueChange={(v) => setFilter("eventType", v)}
                    options={[
                      { value: "any", label: "Any event type" },
                      ...eventTypes.map((e) => ({ value: e.id, label: e.name })),
                    ]}
                  />
                )}
                {layout === "list" && !doneOnly && (
                  <label className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={!!filters.showDone}
                      onChange={(e) => setFilter("done", e.target.checked ? "1" : null)}
                    />
                    Show done
                  </label>
                )}
                {active && view === "" && (
                  <Button variant="ghost" size="sm" onClick={() => pickView("mine")}>
                    <XIcon data-icon="inline-start" />
                    Clear filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <nav aria-label="Layout" className="inline-flex rounded-lg border bg-card p-0.5">
            {(
              [
                ["list", "List", ListIcon],
                ["board", "Board", KanbanSquareIcon],
              ] as const
            ).map(([l, label, Icon]) =>
              l === "board" && !canBoard ? (
                <span
                  key={l}
                  className="inline-flex size-7 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/50"
                  title={`The board comes with ${proName}`}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="sr-only">
                    {label} (comes with {proName})
                  </span>
                </span>
              ) : (
                <button
                  key={l}
                  type="button"
                  aria-current={layout === l ? "page" : undefined}
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    remember(TASKS_LAYOUT_COOKIE, l);
                    go({ layout: l }, { keepView: true });
                  }}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    layout === l
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              ),
            )}
          </nav>
        </div>
      </div>

      {(!canBoard || !canAssign) && (
        <p className="text-xs text-muted-foreground">
          {!canBoard
            ? `The board with drag and drop, your own statuses and saved views come with ${proName}; assigning tasks to teammates with ${teamName}.`
            : `Assigning tasks to teammates, @-mentions and shared views come with ${teamName}.`}{" "}
          <Link href="/admin/billing" className="underline underline-offset-4">
            Upgrade
          </Link>
        </p>
      )}
    </div>
  );
}
