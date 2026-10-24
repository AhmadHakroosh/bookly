"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMessagesUnread } from "@/lib/messages-live";
import { cn } from "@/lib/utils";
import { isActive, navGroups, type NavGroup, type NavOptions } from "@/components/shell/nav";

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

function Group({ g, pathname, className }: { g: NavGroup; pathname: string; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1 px-2.5 text-xs font-medium text-muted-foreground">{g.label}</p>
      <ul className="space-y-0.5">
        {g.items.map((it) => {
          const on = isActive(pathname, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-lg px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
                  on
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-[color-mix(in_oklch,var(--sidebar),var(--foreground)_6%)]",
                )}
              >
                <it.icon
                  className={cn("size-[18px] shrink-0", !on && "text-muted-foreground")}
                  aria-hidden
                />
                <span className="truncate">{it.label}</span>
                {it.unread !== undefined && <UnreadBadge initial={it.unread} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The sidebar's navigation, grouped by the job (`shell/nav.ts`): Work, Hiring (when the
 * workspace runs it), Scheduling, and Workspace for owners and admins, pinned to the bottom.
 * Collaborators (ADR 0005) only get their own profile, schedule and connections.
 */
export function AdminNav(props: NavOptions) {
  const pathname = usePathname();
  const groups = navGroups(props);
  const pinned = groups.filter((g) => g.id === "workspace");
  return (
    <nav className="flex min-h-full flex-col gap-5 text-sm" aria-label="Admin">
      {groups
        .filter((g) => g.id !== "workspace")
        .map((g) => (
          <Group key={g.id} g={g} pathname={pathname} />
        ))}
      {pinned.map((g) => (
        <Group
          key={g.id}
          g={g}
          pathname={pathname}
          className="mt-auto border-t border-sidebar-border pt-4"
        />
      ))}
    </nav>
  );
}
