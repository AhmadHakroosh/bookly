"use client";

import { useSyncExternalStore } from "react";

const fmt = (d: Date, timeZone?: string, zone = false) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
    ...(zone ? { timeZoneName: "short" } : {}),
  }).format(d);

const noop = () => () => {};

/**
 * A deadline in the reader's own time, with the program's when they differ: "Nov 15, 23:59 your
 * time (Nov 15, 23:59 CET)". The server renders the program's time; the browser swaps in its own.
 */
export function LocalTime({ iso, programZone }: { iso: string; programZone: string }) {
  const d = new Date(iso);
  const mine = useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
  const program = fmt(d, programZone, true);
  if (!mine) return <time dateTime={iso}>{program}</time>;
  const local = fmt(d, mine);
  return (
    <time dateTime={iso}>
      {local} your time
      {mine !== programZone && fmt(d, mine, true) !== program ? ` (${program})` : ""}
    </time>
  );
}
