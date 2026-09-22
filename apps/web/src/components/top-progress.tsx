"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar at the top of the viewport while a client-side navigation is in flight. It starts
 * on a click of an internal link and finishes when the URL changes (or after a timeout).
 */
export function TopProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = `${pathname}?${search}`;
  // The URL at the moment a link was clicked; the bar shows until the URL moves on.
  const [started, setStarted] = useState<{ key: string; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest("a[href]");
      if (!a || a.getAttribute("target") === "_blank" || a.hasAttribute("download")) return;
      const url = new URL((a as HTMLAnchorElement).href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      const key = `${location.pathname}?${new URLSearchParams(location.search)}`;
      setStarted({ key, at: Date.now() });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStarted(null), 8000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const active = started !== null && started.key === current;
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 origin-left bg-(--brand) transition-[transform,opacity] ${
        active ? "top-progress-run opacity-100" : "scale-x-0 opacity-0 duration-200"
      }`}
    />
  );
}
