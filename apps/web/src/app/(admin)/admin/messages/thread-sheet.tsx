"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useMessagesLatest } from "@/lib/messages-live";

/** A conversation's content in the right-hand pane (`PaneHost`, `?thread=<id>`). */
export function ThreadSheet({
  children,
}: {
  title?: string;
  closeHref?: string;
  threadId?: string | null;
  children: ReactNode;
}) {
  return <div className="p-5">{children}</div>;
}

/** Re-renders the page when the live stream reports new activity in Messages. */
export function LiveRefresh() {
  const router = useRouter();
  const latest = useMessagesLatest();
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!latest) return;
    if (seen.current !== null && seen.current !== latest) router.refresh();
    seen.current = latest;
  }, [latest, router]);
  return null;
}
