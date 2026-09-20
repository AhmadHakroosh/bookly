"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Scheduling",
    items: [
      { href: "/admin/profile", label: "Booking page" },
      { href: "/admin/event-types", label: "Event types" },
      { href: "/admin/availability", label: "Availability" },
      { href: "/admin/bookings", label: "Bookings" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/admin/calendars", label: "Calendars" },
      { href: "/admin/conferencing", label: "Conferencing" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/admin/team", label: "Team" },
      { href: "/admin/domains", label: "Domains" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);
  return (
    <nav className="space-y-6 text-sm">
      <Link
        href="/admin"
        className={`block rounded-md px-2 py-1.5 font-medium ${active("/admin") ? "bg-muted" : "hover:bg-muted/60"}`}
      >
        Dashboard
      </Link>
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {g.label}
          </p>
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  className={`block rounded-md px-2 py-1.5 ${active(it.href) ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                >
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
