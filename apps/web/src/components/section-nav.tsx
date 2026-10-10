"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type Section = { id: string; label: string };

/**
 * Jump links for a long page split into sections: wraps on narrow screens instead of
 * scrolling sideways, sticks under the header, and highlights the section in view. Each
 * target needs `id` and a `scroll-mt-*` so it lands under the sticky bar.
 */
export function SectionNav({ sections, className }: { sections: Section[]; className?: string }) {
  const [current, setCurrent] = useState(sections[0]?.id);
  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!targets.length) return;
    // The topmost section whose top has passed the bar is the current one.
    const observer = new IntersectionObserver(
      () => {
        const line = 120;
        let best = targets[0]!;
        for (const el of targets) if (el.getBoundingClientRect().top <= line) best = el;
        setCurrent(best.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: [0, 1] },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
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
