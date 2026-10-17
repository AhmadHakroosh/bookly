"use client";

import { useSyncExternalStore } from "react";

/*
 * Messages' live state in the tab. The bell's notification stream (one EventSource per tab)
 * also carries a `messages` event (unread count and newest activity); it publishes here, and
 * the nav badge and the Messages page subscribe. Without the stream, the server-rendered
 * numbers stand.
 */

type Pulse = { unread: number; latest: string | null };

let pulse: Pulse | null = null;
const listeners = new Set<() => void>();

export function publishMessages(next: Pulse) {
  pulse = next;
  for (const l of listeners) l();
}

/** Forget the streamed numbers (after a member reads a thread) so fresh server ones show. */
export function resetMessages() {
  if (!pulse) return;
  pulse = null;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useMessagesUnread(fallback: number) {
  const live = useSyncExternalStore(
    subscribe,
    () => pulse?.unread ?? null,
    () => null,
  );
  return live ?? fallback;
}

export function useMessagesLatest() {
  return useSyncExternalStore(
    subscribe,
    () => pulse?.latest ?? null,
    () => null,
  );
}
