import type { Task } from "@bookly/db/schema";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/time";
import { addTaskAction, removeTask, toggleTask } from "@/app/(admin)/admin/scheduling-actions";

/** Open tasks with complete / remove, plus a quick-add row. Server component. */
export function TaskList({
  tasks,
  tz,
  path,
  contactId,
  bookingId,
  title = "Tasks",
}: {
  tasks: Task[];
  tz: string;
  path: string;
  contactId?: string | null;
  bookingId?: string | null;
  title?: string;
}) {
  const now = new Date();
  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {tasks.map((t) => {
          const overdue = t.dueAt && t.dueAt < now;
          return (
            <li key={t.id} className="flex items-center gap-2">
              <form action={toggleTask.bind(null, t.id, true, path)}>
                <button
                  type="submit"
                  aria-label={`Mark done: ${t.title}`}
                  className="group flex size-5 items-center justify-center rounded border hover:bg-muted"
                >
                  <CheckIcon className="size-3 opacity-0 group-hover:opacity-100" aria-hidden />
                </button>
              </form>
              <span className="flex-1">
                {t.title}
                {t.dueAt && (
                  <span
                    className={`ml-2 text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    due {fmtDate(t.dueAt, tz)}
                  </span>
                )}
              </span>
              <form action={removeTask.bind(null, t.id, path)}>
                <button
                  type="submit"
                  aria-label="Remove task"
                  className="px-1 text-xs text-muted-foreground"
                >
                  <XIcon className="size-3.5" aria-hidden />
                </button>
              </form>
            </li>
          );
        })}
        {tasks.length === 0 && <li className="text-muted-foreground">No open tasks.</li>}
      </ul>
      <form action={addTaskAction} className="mt-3 flex flex-wrap gap-2">
        {contactId && <input type="hidden" name="contactId" value={contactId} />}
        {bookingId && <input type="hidden" name="bookingId" value={bookingId} />}
        <input
          name="title"
          placeholder="Add a task…"
          className="h-8 min-w-48 flex-1 rounded-lg border bg-background px-2 text-sm"
        />
        <input
          name="dueAt"
          type="date"
          aria-label="Due date"
          className="h-8 rounded-lg border bg-background px-2 text-sm"
        />
        <Button type="submit" variant="outline">
          Add
        </Button>
      </form>
    </section>
  );
}
