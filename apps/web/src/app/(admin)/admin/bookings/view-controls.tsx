"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CalendarDaysIcon, ListIcon } from "lucide-react";
import { BOOKINGS_VIEW_COOKIE as VIEW_COOKIE } from "@/lib/calendar";
import { ViewToggle as Toggle } from "@/components/ui/view-toggle";

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
  return (
    <Toggle
      items={(
        [
          ["list", listHref, "List", ListIcon],
          ["calendar", calendarHref, "Calendar", CalendarDaysIcon],
        ] as const
      ).map(([m, href, label, icon]) => ({
        key: m,
        label,
        icon,
        href,
        active: mode === m,
        onClick: () => remember(m),
      }))}
    />
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
