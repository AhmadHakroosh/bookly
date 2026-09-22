"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/console", "Workspaces"],
  ["/console/users", "Users"],
  ["/console/audit", "Audit log"],
  ["/console/health", "Health"],
  ["/console/installs", "Installs"],
] as const;

export function ConsoleNav() {
  const pathname = usePathname();
  const on = (href: string) =>
    href === "/console"
      ? pathname === href ||
        (/^\/console\/[^/]+$/.test(pathname) &&
          !TABS.some(([h]) => h !== "/console" && pathname.startsWith(h)))
      : pathname.startsWith(href);
  return (
    <nav
      className="flex max-w-full flex-wrap gap-1 rounded-lg border p-1 text-sm"
      aria-label="Console"
    >
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={on(href) ? "page" : undefined}
          className={`rounded-md px-3 py-1 whitespace-nowrap ${on(href) ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
