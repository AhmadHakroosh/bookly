"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { resetMessages, useMessagesLatest } from "@/lib/messages-live";
import { markReadAction } from "./actions";

/** A conversation in a right-hand pane over the list, addressed by `?thread=<id>`. */
export function ThreadSheet({
  title,
  closeHref,
  threadId,
  children,
}: {
  title: string;
  closeHref: string;
  threadId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  // Opening a thread reads it (once per thread; after the pane shows, never on prefetch).
  const read = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId || read.current === threadId) return;
    read.current = threadId;
    void markReadAction(threadId).then(() => {
      resetMessages();
      router.refresh();
    });
  }, [threadId, router]);
  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div className="p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
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
