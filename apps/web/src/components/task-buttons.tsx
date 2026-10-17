"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** The tick box that completes a task: ticked the moment it is pressed, while the save runs. */
export function TaskDoneButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      aria-busy={pending}
      disabled={pending}
      className={cn(
        "group flex size-5 items-center justify-center rounded border hover:bg-muted",
        pending && "border-primary bg-primary text-primary-foreground hover:bg-primary",
      )}
    >
      <CheckIcon
        className={cn("size-3", pending ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        aria-hidden
      />
    </button>
  );
}

/** Done / reopen on the task list: shows the new state the moment it is pressed. */
export function TaskToggleButton({ label, done }: { label: string; done: boolean }) {
  const { pending } = useFormStatus();
  const shown = pending ? !done : done;
  return (
    <button
      type="submit"
      aria-label={label}
      aria-busy={pending}
      disabled={pending}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border text-sm hover:bg-muted",
        shown && "border-primary bg-primary text-primary-foreground hover:bg-primary",
      )}
    >
      {shown ? "✓" : ""}
    </button>
  );
}

export function TaskRemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label="Remove task"
      disabled={pending}
      className="px-1 text-xs text-muted-foreground disabled:opacity-50"
    >
      {pending ? <Spinner className="size-3.5" /> : <XIcon className="size-3.5" aria-hidden />}
    </button>
  );
}
