"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarIcon,
  BellIcon,
  BuildingIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  GlobeIcon,
  InboxIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  PlugIcon,
  SettingsIcon,
  SplitIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; external?: boolean };
type Group = { label: string; icon: LucideIcon; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Scheduling",
    icon: CalendarDaysIcon,
    items: [
      { href: "/admin/profile", label: "Booking page", icon: UserIcon },
      { href: "/admin/event-types", label: "Event types", icon: LayoutGridIcon },
      { href: "/admin/availability", label: "Availability", icon: CalendarClockIcon },
      { href: "/admin/bookings", label: "Bookings", icon: CalendarIcon },
      { href: "/admin/contacts", label: "Contacts", icon: UsersIcon },
      { href: "/admin/routing", label: "Routing forms", icon: SplitIcon },
      { href: "/admin/notifications", label: "Notifications", icon: BellIcon },
    ],
  },
  {
    label: "Integrations",
    icon: PlugIcon,
    items: [
      { href: "/admin/calendars", label: "Calendars", icon: CalendarDaysIcon },
      { href: "/admin/conferencing", label: "Conferencing", icon: VideoIcon },
    ],
  },
  {
    label: "Workspace",
    icon: BuildingIcon,
    items: [
      { href: "/admin/team", label: "Team", icon: UsersIcon },
      { href: "/admin/api", label: "API & webhooks", icon: KeyRoundIcon },
      { href: "/admin/domains", label: "Domains", icon: GlobeIcon },
      { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
      { href: "/docs", label: "Documentation", icon: BookOpenIcon, external: true },
    ],
  },
];

export function AdminNav({ cloud = false }: { cloud?: boolean }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);
  const groups = cloud
    ? GROUPS.map((g) =>
        g.label === "Workspace"
          ? {
              ...g,
              items: [
                { href: "/admin/billing", label: "Billing", icon: CreditCardIcon },
                ...g.items,
              ],
            }
          : g,
      )
    : GROUPS;
  const itemClass = (on: boolean) =>
    `flex items-center gap-2 rounded-md px-2 py-1.5 ${on ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`;
  return (
    <nav className="space-y-6 text-sm" aria-label="Admin">
      <Link href="/admin" className={itemClass(active("/admin"))}>
        <InboxIcon className="size-4 shrink-0" aria-hidden />
        Inbox
      </Link>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <g.icon className="size-3.5" aria-hidden />
            {g.label}
          </p>
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.href}>
                {it.external ? (
                  <a href={it.href} target="_blank" rel="noreferrer" className={itemClass(false)}>
                    <it.icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{it.label}</span>
                    <ExternalLinkIcon className="size-3 opacity-60" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <Link href={it.href} className={itemClass(active(it.href))}>
                    <it.icon className="size-4 shrink-0" aria-hidden />
                    {it.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
