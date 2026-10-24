"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import type { DocsSearchEntry } from "@/server/docs";

/**
 * "Search documentation… ⌘K" (the Resources concept): filters the docs' pages and sections as
 * you type and links straight to the section. ⌘K or Ctrl+K focuses it from anywhere on the page;
 * the number of results is announced politely.
 */
export function DocsSearch({ entries }: { entries: DocsSearchEntry[] }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return entries
      .filter((e) => {
        const hay = `${e.title} ${e.page}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8);
  }, [q, entries]);

  return (
    <div role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Search documentation
      </label>
      <div className="flex h-12 items-center gap-3 rounded-xl border bg-card px-4 shadow-[0_12px_30px_-24px_rgb(28_28_28/0.4)] focus-within:ring-3 focus-within:ring-ring/40">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={input}
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Search documentation…"
          autoComplete="off"
          aria-describedby={`${id}-status`}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </div>
      <p id={`${id}-status`} className="sr-only" aria-live="polite">
        {q ? `${results.length} ${results.length === 1 ? "result" : "results"}` : ""}
      </p>
      {q && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border bg-popover shadow-lg">
          {results.length ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="block px-4 py-2.5 hover:bg-muted focus-visible:bg-muted"
                  >
                    <span className="block text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.page}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nothing found for &ldquo;{q}&rdquo;.{" "}
              <Link href="/docs" className="font-medium text-primary hover:underline">
                Browse all docs
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
