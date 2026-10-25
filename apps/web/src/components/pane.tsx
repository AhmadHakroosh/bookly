"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { INSIDE_PANE, PANE_PARAMS, paneTarget } from "@/lib/pane-url";
import { cn } from "@/lib/utils";

/*
 * Side panes that open and close at once. A pane is addressed by a search parameter
 * (`?task=`, `?thread=`, `?file=`, `?booking=`, `?entry=`, `?application=`) so it can be linked and survives a
 * reload, but opening one no longer waits for the server to re-render the page:
 * - Opening (a link that only adds or changes the pane's parameter) updates the address in the
 *   browser right away, so the pane slides in with a skeleton, and fetches its content in the
 *   background (`router.refresh` renders the page for the new address).
 * - Closing (Escape, the backdrop, the close button) only updates the address: no request.
 * The pane's Sheet lives in `PaneHost`, which stays mounted whether a pane is open or not, so
 * the skeleton and the content are the same open sheet.
 */

/** Opens a pane: the address now, the content as soon as the server has it. */
export function openPane(href: string, refresh: () => void) {
  window.history.pushState(null, "", href);
  startTransition(refresh);
}

/**
 * Mounted once in the admin layout: catches clicks on links that only open a pane (see
 * `paneTarget`) before Next's own link handling, and opens the pane without a navigation.
 */
export function PaneLinks() {
  const router = useRouter();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (!paneTarget(a.href, new URL(window.location.href))) return;
      e.preventDefault();
      e.stopPropagation();
      openPane(a.href, router.refresh);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);
  return null;
}

/** Closes the pane: drops its parameter (and paging inside it) from the address. */
export function closePane(param: string) {
  const u = new URL(window.location.href);
  for (const k of [param, ...INSIDE_PANE]) u.searchParams.delete(k);
  window.history.pushState(null, "", `${u.pathname}${u.search}${u.hash}`);
}

export function PaneSkeleton() {
  return (
    <div className="space-y-4 p-5" aria-busy aria-label="Loading">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * The right-hand pane for `?<param>=<id>`. `id` is the one the server rendered `children` for;
 * while the address asks for another (just clicked), the skeleton shows instead. On closing,
 * the content stays during the slide-out.
 */
export function PaneHost({
  param,
  id,
  label,
  className,
  children,
}: {
  param: (typeof PANE_PARAMS)[number];
  id: string | null;
  /** The dialog's accessible name (the content carries its own visible title). */
  label: string;
  /** Width and other overrides of the sheet. */
  className?: string;
  children: ReactNode;
}) {
  const wanted = useSearchParams().get(param);
  const ready = !!id && id === wanted;
  return (
    <Sheet open={!!wanted} onOpenChange={(open) => !open && closePane(param)}>
      <SheetContent
        side="right"
        className={cn("w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl", className)}
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        {wanted && !ready ? <PaneSkeleton /> : children}
      </SheetContent>
    </Sheet>
  );
}
