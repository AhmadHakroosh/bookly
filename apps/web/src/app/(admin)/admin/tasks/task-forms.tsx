"use client";

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
