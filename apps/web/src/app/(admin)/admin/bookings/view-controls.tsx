"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CalendarDaysIcon, ListIcon } from "lucide-react";
import { BOOKINGS_VIEW_COOKIE as VIEW_COOKIE } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/** Remembers the chosen view for a year (read by the page when the URL names none). */
function remember(m: "list" | "calendar") {
  document.cookie = `${VIEW_COOKIE}=${m}; path=/admin; max-age=31536000; samesite=lax`;
}

/** List / Calendar switch; the choice is remembered in a cookie for the next visit. */
export function ViewToggle({
  mode,
  listHref,
  calendarHref,
}: {
  mode: "list" | "calendar";
  listHref: string;
  calendarHref: string;
}) {
  const item = (m: "list" | "calendar", href: string, label: string, Icon: typeof ListIcon) => (
    <Link
      href={href}
      onClick={() => remember(m)}
      aria-current={mode === m ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm",
        mode === m
          ? "bg-background font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
  return (
    <nav aria-label="View" className="inline-flex rounded-lg bg-muted p-1">
      {item("list", listHref, "List", ListIcon)}
      {item("calendar", calendarHref, "Calendar", CalendarDaysIcon)}
    </nav>
  );
}

/**
 * Calendar shortcuts: ← and → step the range, T jumps to today, D / W / M switch the view.
 * Ignored while typing and while the booking pane is open (it has its own keys).
 */
export function CalendarKeys({
  prevHref,
  nextHref,
  todayHref,
  dayHref,
  weekHref,
  monthHref,
}: {
  prevHref: string;
  nextHref: string;
  todayHref: string;
  dayHref: string;
  weekHref: string;
  monthHref: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[data-slot="sheet-content"]')) return;
      const go = (href: string) => {
        e.preventDefault();
        router.push(href, { scroll: false });
      };
      if (e.key === "ArrowLeft") go(prevHref);
      else if (e.key === "ArrowRight") go(nextHref);
      else if (e.key === "t") go(todayHref);
      else if (e.key === "d") go(dayHref);
      else if (e.key === "w") go(weekHref);
      else if (e.key === "m") go(monthHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref, todayHref, dayHref, weekHref, monthHref]);
  return null;
}
