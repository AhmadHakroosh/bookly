"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/**
 * A booking in a right-hand pane over the bookings view, addressed by `?booking=<id>` so it
 * can be linked and survives a reload. Closing (Escape, the backdrop, the button) drops the
 * parameter; previous / next (buttons, or J and K) walk the bookings of the current view
 * without leaving the page.
 */
export function BookingPane({
  title,
  closeHref,
  prevHref,
  nextHref,
  fullHref,
  position,
  children,
}: {
  title: string;
  closeHref: string;
  prevHref: string | null;
  nextHref: string | null;
  fullHref: string;
  /** "3 of 12" within the current view, when the booking is in it. */
  position: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" && nextHref) router.push(nextHref, { scroll: false });
      if (e.key === "k" && prevHref) router.push(prevHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref]);
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.push(closeHref, { scroll: false });
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-popover/95 py-2 pr-14 pl-3 backdrop-blur">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!prevHref}
            aria-label="Previous booking (K)"
            nativeButton={false}
            render={prevHref ? <Link href={prevHref} scroll={false} /> : <span />}
          >
            <ChevronUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!nextHref}
            aria-label="Next booking (J)"
            nativeButton={false}
            render={nextHref ? <Link href={nextHref} scroll={false} /> : <span />}
          >
            <ChevronDownIcon />
          </Button>
          {position && <span className="ml-1 text-xs text-muted-foreground">{position}</span>}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            nativeButton={false}
            render={<Link href={fullHref} />}
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Open page
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
