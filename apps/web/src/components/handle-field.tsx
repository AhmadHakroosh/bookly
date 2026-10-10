"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { checkHandle, type HandleCheck, type HandleKind } from "@/lib/handles";
import { cn } from "@/lib/utils";

export type HandleStatus =
  | { state: "idle" }
  /** The value already saved: nothing to check and nothing to say. */
  | { state: "own"; value: string }
  | { state: "checking" }
  | { state: "ok"; value: string }
  | { state: "error"; error: string };

/**
 * Live feedback for an address or username: the format rules run on every keystroke, the
 * availability check (a server action) runs once typing pauses. `ok` is true when the value
 * is the one already saved or the last check passed for the current value, which is what
 * gates the submit button.
 */
export function useHandleCheck(
  value: string,
  kind: HandleKind,
  check: (raw: string) => Promise<HandleCheck>,
  opts: { initial?: string; delay?: number } = {},
) {
  const raw = value.trim();
  const local = useMemo(() => (raw ? checkHandle(raw, kind) : null), [raw, kind]);
  const own = !!opts.initial && local?.ok === true && local.value === opts.initial.toLowerCase();
  // The last answer from the server, tagged with the value it was about.
  const [remote, setRemote] = useState<{ value: string; result: HandleCheck } | null>(null);
  const delay = opts.delay ?? 400;
  useEffect(() => {
    // The value already saved needs no round trip; anything else is asked about after a pause.
    if (!local?.ok || own) return;
    const { value: v } = local;
    const t = setTimeout(() => {
      check(v)
        .catch((): HandleCheck => ({ ok: false, error: "Could not check. Try again." }))
        .then((result) => setRemote({ value: v, result }));
    }, delay);
    return () => clearTimeout(t);
  }, [local, own, check, delay]);

  let status: HandleStatus;
  if (!local) status = { state: "idle" };
  else if (!local.ok) status = { state: "error", error: local.error };
  else if (own) status = { state: "own", value: local.value };
  else if (remote?.value === local.value)
    status = remote.result.ok
      ? { state: "ok", value: remote.result.value }
      : { state: "error", error: remote.result.error };
  else status = { state: "checking" };
  return { status, ok: status.state === "ok" || status.state === "own" };
}

/**
 * The input for a handle, with the check's outcome inside the field: a spinner and
 * "Checking…" while the server is asked, a tick and "Available" when it is free, a cross when
 * it is not (the reason goes under the field). `suffix` is fixed text after the value, such as
 * the root domain of a workspace address.
 */
export function HandleField({
  status,
  suffix,
  className,
  ...input
}: ComponentProps<typeof Input> & { status: HandleStatus; suffix?: string }) {
  const invalid = status.state === "error";
  return (
    <div
      className={cn(
        "flex h-10 items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50",
        className,
      )}
    >
      <Input
        {...input}
        aria-invalid={invalid || undefined}
        className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      {suffix && (
        <span className="shrink-0 pr-2.5 text-sm whitespace-nowrap text-muted-foreground">
          {suffix}
        </span>
      )}
      <HandleBadge status={status} />
    </div>
  );
}

function HandleBadge({ status }: { status: HandleStatus }) {
  if (status.state === "checking")
    return (
      <span className="flex shrink-0 items-center gap-1.5 border-l border-input px-2.5 text-xs text-muted-foreground">
        <Spinner className="size-3.5" aria-hidden />
        Checking…
      </span>
    );
  if (status.state === "ok")
    return (
      <span className="flex shrink-0 items-center gap-1.5 border-l border-input px-2.5 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckIcon className="size-3.5" aria-hidden />
        Available
      </span>
    );
  if (status.state === "error")
    return (
      <span className="flex shrink-0 items-center border-l border-input px-2.5 text-destructive">
        <XIcon className="size-3.5" aria-label="Not available" />
      </span>
    );
  return null;
}

/** The line under the field: the reason when the handle cannot be used, or the fallback help. */
export function HandleHint({ status, fallback }: { status: HandleStatus; fallback: string }) {
  if (status.state === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        {status.error}
      </p>
    );
  return <p className="text-sm text-muted-foreground">{fallback}</p>;
}
