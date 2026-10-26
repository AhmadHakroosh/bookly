"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
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
import { MentionTextarea } from "@/components/mention-textarea";
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

/** A task's content in the right-hand pane (`PaneHost`, `?task=<id>`). */
export function TaskPane({
  children,
}: {
  title?: string;
  closeHref?: string;
  children: ReactNode;
}) {
  return <div className="p-5">{children}</div>;
}

/**
 * One task's properties as `ui mocks.png` 05 lists them in its pane: label on the left, value
 * on the right (title, assignee, due date, contact and meeting, status), then the description.
 */
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
  links = [],
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
  /** Read-only rows: the contact and the meeting the task belongs to. */
  links?: { label: string; href: string; text: string }[];
}) {
  const [state, action] = useActionState(updateTaskAction.bind(null, taskId), {} as ActionResult);
  useResultToast(state, "Saved");
  const row = "grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3";
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2.5 text-sm">
        <label className={row}>
          <span className="text-muted-foreground">Title</span>
          <Input name="title" defaultValue={title} required maxLength={200} size="sm" />
        </label>
        {canAssign && (
          <div className={row}>
            <span className="text-muted-foreground">Assignee</span>
            <Dropdown
              name="assignee"
              ariaLabel="Assignee"
              size="sm"
              defaultValue={assignee}
              options={people.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        )}
        <div className={row}>
          <span className="text-muted-foreground">Due date</span>
          <DatePicker
            name="dueAt"
            defaultValue={dueAt}
            ariaLabel="Due date"
            placeholder="No due date"
            size="sm"
          />
        </div>
        {links.map((l) => (
          <div key={l.label} className={row}>
            <span className="text-muted-foreground">{l.label}</span>
            <Link href={l.href} className="truncate text-primary hover:underline">
              {l.text}
            </Link>
          </div>
        ))}
        {canBoard && (
          <div className={row}>
            <span className="text-muted-foreground">Status</span>
            <Dropdown
              name="statusId"
              ariaLabel="Status"
              size="sm"
              defaultValue={statusId ?? statuses[0]?.id}
              options={statuses.map((st) => ({ value: st.id, label: st.name }))}
            />
          </div>
        )}
      </div>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Description</span>
        <Textarea
          name="description"
          defaultValue={description}
          rows={4}
          maxLength={5000}
          placeholder="Details, links, what done looks like"
        />
      </label>
      <SubmitButton pendingText="Saving…" size="sm">
        Save
      </SubmitButton>
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
  useResultToast(state);
  return (
    <form action={action} className="space-y-2">
      <MentionTextarea
        id={taskId}
        name="body"
        value={text}
        onValueChange={setText}
        people={people}
        ariaLabel="Comment"
        placeholder={
          people.length ? "Add a comment. Type @ to mention a teammate." : "Add a comment"
        }
      />
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
  defaultOpen = false,
}: {
  statuses: Option[];
  /** Opened by `?new=1` (Create on Home). */
  defaultOpen?: boolean;
  people: Option[];
  canBoard: boolean;
  canAssign: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    // Closing forgets ?new=1, so a reload does not open the form again.
    if (!o && new URL(location.href).searchParams.has("new")) {
      const u = new URL(location.href);
      u.searchParams.delete("new");
      history.replaceState(null, "", u.pathname + u.search);
    }
  };
  const [state, action] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await createTaskAction(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, {} as ActionResult);
  useResultToast(state, "Task added");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
