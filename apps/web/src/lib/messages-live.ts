"use client";

import { useSyncExternalStore } from "react";

/*
 * Messages' live state in the tab. The bell's live connection (`lib/realtime-client.ts`, one per
 * tab) hears when a thread moves and publishes the member's unread count and newest activity
 * here; the nav badge and the Messages page subscribe. Without a connection, the
 * server-rendered numbers stand.
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
