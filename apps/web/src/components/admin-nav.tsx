"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMessagesUnread } from "@/lib/messages-live";
import { cn } from "@/lib/utils";
import {
  isActive,
  navSections,
  solutionOf,
  type NavItem,
  type NavOptions,
  type Solution,
} from "@/components/shell/nav";

function UnreadBadge({ initial }: { initial: number }) {
  const n = useMessagesUnread(initial);
  if (!n) return null;
  return (
    <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
      {n > 99 ? "99+" : n}
      <span className="sr-only"> unread</span>
    </span>
  );
}

function Items({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map((it) => {
        const on = [it.href, ...(it.also ?? [])].some((h) => isActive(pathname, h));
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
                on
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-[color-mix(in_oklch,var(--sidebar),var(--foreground)_6%)]",
              )}
            >
              <it.icon
                className={cn("size-5 shrink-0", !on && "text-muted-foreground")}
                aria-hidden
              />
              <span className="truncate">{it.label}</span>
              {it.unread !== undefined && <UnreadBadge initial={it.unread} />}
              {!!it.count && (
                <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
                  {it.count > 99 ? "99+" : it.count}
                  <span className="sr-only"> to do</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The sidebar's navigation as `app ui.png` draws it: the primary items, a divider, the
 * scheduling items, and Settings and Team pinned to the bottom, with no group headings. In the
 * hiring beta a switch above swaps in Hiring's own items (`hiring.png`); Messages, Files,
 * Settings and Team keep whichever side you came from. Collaborators (ADR 0005) only get their
 * own profile, schedule and connections.
 */
export function AdminNav(props: NavOptions) {
  const pathname = usePathname();
  // Hiring pages open the Hiring side, client pages the Clients side; shared pages stay put.
  const [solution, setSolution] = useState<Solution>(solutionOf(pathname) ?? "clients");
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    const next = solutionOf(pathname);
    if (next && next !== solution) setSolution(next);
  }
  const switchable = !!props.hiring && !props.collaborator;
  const sections = navSections(props, switchable ? solution : "clients");
  const bottom = sections.find((s) => s.id === "bottom" && s.items.length);
  return (
    <nav className="flex flex-1 flex-col gap-4 text-sm" aria-label="Admin">
      {switchable && (
        <div
          role="group"
          aria-label="Solution"
          className="grid grid-cols-2 gap-1 rounded-lg bg-[color-mix(in_oklch,var(--sidebar),var(--foreground)_6%)] p-1 text-sm font-medium"
        >
          {(
            [
              ["clients", "Clients", "/admin"],
              ["hiring", "Hiring", "/admin/hiring"],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              aria-current={solution === key ? "true" : undefined}
              className={cn(
                "rounded-md px-2 py-1.5 text-center outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
                solution === key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      {sections
        .filter((s) => s.id !== "bottom" && s.items.length)
        .map((s, i) => (
          <div key={s.id} className={cn(i > 0 && "border-t border-sidebar-border pt-4")}>
            <Items items={s.items} pathname={pathname} />
          </div>
        ))}
      {bottom && (
        <div className="mt-auto pt-4">
          <Items items={bottom.items} pathname={pathname} />
        </div>
      )}
    </nav>
  );
}
