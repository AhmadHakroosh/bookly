"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";

/** The tick box that completes a task; shows progress while its form action runs. */
export function TaskDoneButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      aria-busy={pending}
      disabled={pending}
      className="group flex size-5 items-center justify-center rounded border hover:bg-muted disabled:opacity-50"
    >
      {pending ? (
        <Spinner className="size-3" />
      ) : (
        <CheckIcon className="size-3 opacity-0 group-hover:opacity-100" aria-hidden />
      )}
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
