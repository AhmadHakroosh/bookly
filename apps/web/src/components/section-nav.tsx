"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type Section = { id: string; label: string };

/**
 * Jump links for a long page split into sections: wraps on narrow screens instead of
 * scrolling sideways, sticks under the header, and highlights the section in view. Each
 * target needs `id` and a `scroll-mt-*` so it lands under the sticky bar; the highlight uses
 * that same margin as its line, so a section is current from the moment it is scrolled to.
 */
export function SectionNav({ sections, className }: { sections: Section[]; className?: string }) {
  const [current, setCurrent] = useState(sections[0]?.id);
  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!targets.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Reaching the end of the page means the last section, however short it is.
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      if (atBottom) return setCurrent(targets[targets.length - 1]!.id);
      // The line is where a scrolled-to section's top lands, plus a little slack.
      const line = parseFloat(getComputedStyle(targets[0]!).scrollMarginTop || "0") + 8;
      let best = targets[0]!;
      for (const el of targets) if (el.getBoundingClientRect().top <= line) best = el;
      setCurrent(best.id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);
  return (
    <nav
      aria-label="Sections"
      className={cn(
        "sticky top-14 z-20 -mx-4 flex flex-wrap gap-1 border-b bg-background/95 px-4 py-2 text-sm backdrop-blur lg:mx-0 lg:px-0",
        className,
      )}
    >
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={current === s.id ? "location" : undefined}
          onClick={() => setCurrent(s.id)}
          className={cn(
            "rounded-md px-2.5 py-1 whitespace-nowrap",
            current === s.id
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
