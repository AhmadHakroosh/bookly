"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { DatePicker } from "@/components/date-picker";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  addCommentAction,
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
  type ActionResult,
} from "./actions";

type Option = { id: string; name: string };

function useResultToast(state: ActionResult, ok?: string) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok && ok) toast.success(ok);
  }, [state, ok]);
}

/** A task in a right-hand pane over the board or list, addressed by `?task=<id>`. */
export function TaskPane({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div className="p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Title, description, status, assignee and due date of one task. */
export function TaskEditForm({
  taskId,
  title,
  description,
  dueAt,
  statusId,
  assignee,
  statuses,
  people,
  canBoard,
  canAssign,
}: {
  taskId: string;
  title: string;
  description: string;
  dueAt: string | null;
  statusId: string | null;
  assignee: string;
  statuses: Option[];
  people: Option[];
  canBoard: boolean;
  canAssign: boolean;
}) {
  const [state, action] = useActionState(updateTaskAction.bind(null, taskId), {} as ActionResult);
  useResultToast(state, "Saved");
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Title</span>
        <Input name="title" defaultValue={title} required maxLength={200} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {canBoard && (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Status</span>
            <Dropdown
              name="statusId"
              ariaLabel="Status"
              defaultValue={statusId ?? statuses[0]?.id}
              options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Due</span>
          <DatePicker
            name="dueAt"
            defaultValue={dueAt}
            ariaLabel="Due date"
            placeholder="No due date"
          />
        </label>
        {canAssign && (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Assignee</span>
            <Dropdown
              name="assignee"
              ariaLabel="Assignee"
              defaultValue={assignee}
              options={people.map((p) => ({ value: p.id, label: p.name }))}
            />
          </label>
        )}
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notes</span>
        <Textarea
          name="description"
          defaultValue={description}
          rows={4}
          maxLength={5000}
          placeholder="Details, links, what done looks like"
        />
      </label>
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}

export function DeleteTaskButton({ taskId, closeHref }: { taskId: string; closeHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!window.confirm("Delete this task and its comments?")) return;
          const r = await deleteTaskAction(taskId);
          if (r.error) return void toast.error(r.error);
          router.push(closeHref, { scroll: false });
        })
      }
    >
      <Trash2Icon data-icon="inline-start" />
      Delete task
    </Button>
  );
}

/**
 * A comment box. With teammates to mention, typing "@" lists them; picking one inserts
 * "@Name" (the server turns names back into people and notifies them).
 */
export function CommentForm({ taskId, people }: { taskId: string; people: Option[] }) {
  const [state, action] = useActionState(addCommentAction.bind(null, taskId), {} as ActionResult);
  const [text, setText] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useResultToast(state);

  const matches =
    query === null
      ? []
      : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const onChange = (value: string, caret: number) => {
    setText(value);
    const before = value.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    setQuery(m && people.length ? m[2]! : null);
    setHighlight(0);
  };

  const insert = (p: Option) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <form action={action} className="space-y-2">
      <div className="relative">
        <Textarea
          ref={ref}
          name="body"
          value={text}
          rows={3}
          maxLength={4000}
          aria-label="Comment"
          placeholder={
            people.length ? "Add a comment. Type @ to mention a teammate." : "Add a comment"
          }
          onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (!matches.length) return;
            if (e.key === "Escape") return setQuery(null);
            const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
            if (step) {
              e.preventDefault();
              setHighlight((h) => (h + step + matches.length) % matches.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insert(matches[highlight]!);
            }
          }}
          aria-autocomplete="list"
          aria-controls={matches.length ? `mentions-${taskId}` : undefined}
          aria-activedescendant={matches.length ? `mention-${taskId}-${highlight}` : undefined}
        />
        {matches.length > 0 && (
          <ul
            id={`mentions-${taskId}`}
            role="listbox"
            aria-label="Teammates"
            className="absolute top-full left-0 z-10 mt-1 w-56 overflow-hidden rounded-lg border bg-popover text-sm shadow-md"
          >
            {matches.map((p, i) => (
              <li
                key={p.id}
                id={`mention-${taskId}-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(p);
                }}
                className={`cursor-pointer px-3 py-1.5 ${i === highlight ? "bg-muted" : ""}`}
              >
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <SubmitButton variant="outline" pendingText="Posting…" disabled={!text.trim()}>
        Comment
      </SubmitButton>
    </form>
  );
}

/** "New task" with title, notes, due date, status and (Team) assignee. */
export function NewTaskButton({
  statuses,
  people,
  canBoard,
  canAssign,
}: {
  statuses: Option[];
  people: Option[];
  canBoard: boolean;
  canAssign: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await createTaskAction(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, {} as ActionResult);
  useResultToast(state, "Task added");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        New task
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Title</span>
            <Input
              name="title"
              required
              maxLength={200}
              autoFocus
              placeholder="Send the proposal"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Due</span>
              <DatePicker name="dueAt" ariaLabel="Due date" placeholder="No due date" />
            </label>
            {canBoard && (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Status</span>
                <Dropdown
                  name="statusId"
                  ariaLabel="Status"
                  defaultValue={statuses[0]?.id}
                  options={statuses.map((s) => ({ value: s.id, label: s.name }))}
                />
              </label>
            )}
            {canAssign && (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Assignee</span>
                <Dropdown
                  name="assignee"
                  ariaLabel="Assignee"
                  defaultValue="me"
                  options={[
                    { value: "me", label: "Me" },
                    ...people.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </label>
            )}
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Notes</span>
            <Textarea name="description" rows={3} maxLength={5000} />
          </label>
          <SubmitButton pendingText="Adding…" className="w-full">
            Add task
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
