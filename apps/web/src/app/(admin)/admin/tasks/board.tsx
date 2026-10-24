"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarIcon, MessageSquareIcon, PlusIcon, UserIcon } from "lucide-react";
import type { TaskFilters } from "@bookly/db/schema";
import { Button } from "@/components/ui/button";
import { cardOf, type CardTask } from "@/lib/task-card";
import { cn } from "@/lib/utils";
import { createTaskAction, loadColumnAction, moveTaskAction, type ActionResult } from "./actions";

export type { CardTask };

export type Column = {
  status: { id: string; name: string; color: string; isDone: boolean; wipLimit: number | null };
  total: number;
  tasks: CardTask[];
  next: string | null;
};

function Card({
  task,
  href,
  overlay = false,
  showAssignee,
}: {
  task: CardTask;
  href?: string;
  overlay?: boolean;
  showAssignee: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-2.5 text-sm shadow-xs",
        overlay && "rotate-2 shadow-lg ring-2 ring-ring/40",
      )}
      data-href={href}
    >
      <p className="leading-snug font-medium">{task.title}</p>
      {(task.contact || task.booking) && (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {[task.contact, task.booking].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {task.due && (
          <span
            className={cn("inline-flex items-center gap-1", task.overdue && "text-destructive")}
          >
            <CalendarIcon className="size-3" aria-hidden />
            {task.due}
            {task.overdue && <span className="sr-only">(overdue)</span>}
          </span>
        )}
        {showAssignee && task.assignee && (
          <span className="inline-flex items-center gap-1">
            <UserIcon className="size-3" aria-hidden />
            {task.assignee}
          </span>
        )}
        {task.comments > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquareIcon className="size-3" aria-hidden />
            {task.comments}
            <span className="sr-only">comments</span>
          </span>
        )}
      </div>
    </div>
  );
}

function SortableCard({
  task,
  href,
  showAssignee,
}: {
  task: CardTask;
  href: string;
  showAssignee: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable task"
      aria-label={`${task.title}. Press Enter to open, Space to move.`}
      onClick={() => router.push(href, { scroll: false })}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) router.push(href, { scroll: false });
      }}
      className={cn(
        "cursor-grab touch-manipulation rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <Card task={task} showAssignee={showAssignee} />
    </li>
  );
}

function QuickAdd({ statusId }: { statusId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createTaskAction, {} as ActionResult);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) formRef.current?.reset();
  }, [state]);
  if (!open)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <PlusIcon data-icon="inline-start" />
        Add task
      </Button>
    );
  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="statusId" value={statusId} />
      <input
        name="title"
        autoFocus
        required
        placeholder="What needs doing?"
        aria-label="New task title"
        className="w-full rounded-lg border bg-background px-3 text-sm"
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ColumnView({
  column,
  tasks,
  hrefFor,
  showAssignee,
  onMore,
  loadingMore,
  children,
}: {
  column: Column;
  tasks: CardTask[];
  hrefFor: (id: string) => string;
  showAssignee: boolean;
  onMore: () => void;
  loadingMore: boolean;
  children?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.status.id}` });
  const { status } = column;
  const over = status.wipLimit !== null && column.total > status.wipLimit;
  return (
    <section
      ref={setNodeRef}
      aria-label={status.name}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30",
        isOver && "ring-2 ring-ring/30",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="size-2.5 rounded-full" style={{ background: status.color }} aria-hidden />
        <h2 className="truncate text-sm font-semibold">{status.name}</h2>
        <span
          className={cn(
            "ml-auto text-xs tabular-nums",
            over ? "font-medium text-warning" : "text-muted-foreground",
          )}
          title={over ? `More than the ${status.wipLimit} this column should hold` : undefined}
        >
          {column.total}
          {status.wipLimit !== null && ` / ${status.wipLimit}`}
        </span>
      </header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} href={hrefFor(t.id)} showAssignee={showAssignee} />
          ))}
          {tasks.length === 0 && (
            <li className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              {status.isDone ? "Drop finished tasks here" : "No tasks"}
            </li>
          )}
        </ul>
      </SortableContext>
      <div className="space-y-1 px-2 pb-2">
        {column.next && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onMore}
            disabled={loadingMore}
          >
            Show more
          </Button>
        )}
        {children}
      </div>
    </section>
  );
}

/**
 * The task board: one column per status, cards dragged within and between columns with the
 * mouse, a finger (press and hold) or the keyboard (Space to pick up, arrows to move, Space to
 * drop, Escape to cancel). A drop is shown at once and saved in the background; if the server
 * refuses, the board reloads.
 */
export function Board({
  columns,
  filters,
  hrefFor: hrefBase,
  showAssignee,
  tz,
  people,
}: {
  columns: Column[];
  filters: TaskFilters;
  /** `?task=` link base: the task id is appended. */
  hrefFor: string;
  showAssignee: boolean;
  /** For cards loaded by "Show more": the viewer's timezone and member names by user id. */
  tz: string;
  people: Record<string, string>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Record<string, CardTask[]>>(() =>
    Object.fromEntries(columns.map((c) => [c.status.id, c.tasks])),
  );
  const [next, setNext] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(columns.map((c) => [c.status.id, c.next])),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const origin = useRef<string | null>(null);
  const hrefFor = (id: string) => `${hrefBase}${hrefBase.includes("?") ? "&" : "?"}task=${id}`;

  // The keyboard getter reads the latest columns through a ref (it is created once).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const order = columns.map((c) => c.status.id);

  /**
   * ← and → jump to the neighbouring column, landing at the same position (or last when that
   * column is shorter); ↑ and ↓ move within the column. dnd-kit's own getter only handles a
   * single list reliably, which is why its multi-column example ships its own too.
   */
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (event.code !== "ArrowLeft" && event.code !== "ArrowRight")
      return sortableKeyboardCoordinates(event, args);
    event.preventDefault();
    const { active, droppableRects } = args.context;
    if (!active) return undefined;
    const all = itemsRef.current;
    const from = Object.keys(all).find((k) => all[k]!.some((t) => t.id === String(active.id)));
    const to = order[order.indexOf(from ?? "") + (event.code === "ArrowRight" ? 1 : -1)];
    if (!from || !to) return undefined;
    const index = all[from]!.findIndex((t) => t.id === String(active.id));
    const target = all[to]!.filter((t) => t.id !== String(active.id));
    const anchor = target[Math.min(index, target.length - 1)];
    const rect = (anchor && droppableRects.get(anchor.id)) ?? droppableRects.get(`column:${to}`);
    if (!rect) return undefined;
    // Into the column's list, below its header, when the column is empty.
    return { x: rect.left + 8, y: rect.top + (anchor ? 4 : 48) };
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const columnOf = (id: string): string | null => {
    if (id.startsWith("column:")) return id.slice(7);
    return Object.keys(items).find((k) => items[k]!.some((t) => t.id === id)) ?? null;
  };
  const byId = useMemo(
    () =>
      new Map(
        Object.values(items)
          .flat()
          .map((t) => [t.id, t]),
      ),
    [items],
  );
  const name = (statusId: string | null) =>
    columns.find((c) => c.status.id === statusId)?.status.name ?? "";

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const col = columnOf(String(active.id));
      return `Picked up ${byId.get(String(active.id))?.title ?? "task"} in ${name(col)}. Use the arrow keys to move it, Space to drop, Escape to cancel.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over)
        return `${byId.get(String(active.id))?.title ?? "Task"} is no longer over a column.`;
      const col = columnOf(String(over.id));
      const list = col ? items[col]! : [];
      const at = list.findIndex((t) => t.id === String(active.id));
      return `${name(col)}, position ${at + 1} of ${list.length}.`;
    },
    onDragEnd: ({ active, over }) => {
      const col = over ? columnOf(String(over.id)) : null;
      return col
        ? `Dropped ${byId.get(String(active.id))?.title ?? "task"} in ${name(col)}.`
        : "Dropped.";
    },
    onDragCancel: ({ active }) =>
      `Moving ${byId.get(String(active.id))?.title ?? "the task"} was cancelled.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    origin.current = columnOf(String(active.id));
  };

  // Crossing into another column moves the card there right away, so the drop target is live.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = columnOf(String(active.id));
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    setItems((prev) => {
      const moving = prev[from]!.find((t) => t.id === String(active.id));
      if (!moving) return prev;
      const target = prev[to]!;
      const overIndex = target.findIndex((t) => t.id === String(over.id));
      const at = overIndex < 0 ? target.length : overIndex;
      return {
        ...prev,
        [from]: prev[from]!.filter((t) => t.id !== moving.id),
        [to]: [...target.slice(0, at), moving, ...target.slice(at)],
      };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const id = String(active.id);
    const to = over ? columnOf(String(over.id)) : null;
    if (!to) return;
    let list = items[to]!;
    const oldIndex = list.findIndex((t) => t.id === id);
    const overIndex = list.findIndex((t) => t.id === String(over!.id));
    if (oldIndex >= 0 && overIndex >= 0 && oldIndex !== overIndex) {
      list = arrayMove(list, oldIndex, overIndex);
      setItems((prev) => ({ ...prev, [to]: list }));
    } else if (origin.current === to && (overIndex < 0 || oldIndex === overIndex)) return;
    const at = list.findIndex((t) => t.id === id);
    const prevId = list[at - 1]?.id ?? null;
    const nextId = list[at + 1]?.id ?? null;
    void moveTaskAction(id, to, prevId, nextId).then((r) => {
      if (r.error) {
        toast.error(r.error);
        router.refresh();
      }
    });
  };

  const more = (statusId: string) =>
    startLoading(async () => {
      const cursor = next[statusId];
      if (!cursor) return;
      const page = await loadColumnAction(statusId, cursor, filters);
      if (!page) return;
      setItems((prev) => ({
        ...prev,
        [statusId]: [
          ...prev[statusId]!,
          ...page.rows.map((r) => cardOf(r, tz, people)).filter((c) => !byId.has(c.id)),
        ],
      }));
      setNext((prev) => ({ ...prev, [statusId]: page.next }));
    });

  const active = activeId ? byId.get(activeId) : null;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        router.refresh();
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a task, press Space. Use the arrow keys to move it within a column or to another column, Space to drop it, Escape to cancel. Press Enter to open it.",
        },
      }}
    >
      <div
        className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8"
        role="region"
        aria-label="Task board"
      >
        <div className="flex items-start gap-3">
          {columns.map((c) => (
            <ColumnView
              key={c.status.id}
              column={{ ...c, next: next[c.status.id] ?? null }}
              tasks={items[c.status.id] ?? []}
              hrefFor={hrefFor}
              showAssignee={showAssignee}
              onMore={() => more(c.status.id)}
              loadingMore={loading}
            >
              {!c.status.isDone && <QuickAdd statusId={c.status.id} />}
            </ColumnView>
          ))}
        </div>
      </div>
      <DragOverlay>
        {active ? <Card task={active} overlay showAssignee={showAssignee} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
