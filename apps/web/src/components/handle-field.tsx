"use client";

import { useEffect, useMemo, useState } from "react";
import { checkHandle, type HandleCheck, type HandleKind } from "@/lib/handles";

export type HandleStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; value: string }
  | { state: "error"; error: string };

/**
 * Live feedback for an address or username: the format rules run on every keystroke, the
 * availability check (a server action) runs once typing pauses. `ok` is true only when the
 * last check passed for the current value, which is what gates the submit button.
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
  else if (own) status = { state: "ok", value: local.value };
  else if (remote?.value === local.value)
    status = remote.result.ok
      ? { state: "ok", value: remote.result.value }
      : { state: "error", error: remote.result.error };
  else status = { state: "checking" };
  return { status, ok: status.state === "ok" };
}

/** The line under the field: what is wrong, or that the handle is free. */
export function HandleHint({ status, fallback }: { status: HandleStatus; fallback: string }) {
  if (status.state === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        {status.error}
      </p>
    );
  if (status.state === "checking")
    return <p className="text-sm text-muted-foreground">Checking…</p>;
  if (status.state === "ok")
    return <p className="text-sm text-emerald-600 dark:text-emerald-400">Available</p>;
  return <p className="text-sm text-muted-foreground">{fallback}</p>;
}
