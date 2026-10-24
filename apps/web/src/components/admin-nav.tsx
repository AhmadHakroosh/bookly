"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitHubIcon } from "@/components/brand/logo";
import { useMessagesUnread } from "@/lib/messages-live";
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
  LifeBuoyIcon,
  HomeIcon,
  MessagesSquareIcon,
  LayoutGridIcon,
  PlugIcon,
  FolderIcon,
  SettingsIcon,
  SquareKanbanIcon,
  SplitIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
  /** Messages: the unread count, kept live by the notification stream. */
  unread?: number;
};

function UnreadBadge({ initial }: { initial: number }) {
  const n = useMessagesUnread(initial);
  if (!n) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums">
      {n > 99 ? "99+" : n}
      <span className="sr-only"> unread</span>
    </span>
  );
}
type Group = { label: string; icon: LucideIcon; items: Item[] };

/**
 * Three kinds of pages: your scheduling, your own connections, and the workspace everyone
 * shares. The Workspace group is for owners and admins; members never see it.
 */
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
    ],
  },
  {
    label: "Personal",
    icon: PlugIcon,
    items: [
      { href: "/admin/calendars", label: "Calendars", icon: CalendarDaysIcon },
      { href: "/admin/conferencing", label: "Conferencing", icon: VideoIcon },
      { href: "/admin/notifications", label: "Notifications", icon: BellIcon },
    ],
  },
];

const WORKSPACE = (cloud: boolean): Group => ({
  label: "Workspace",
  icon: BuildingIcon,
  items: [
    { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
    { href: "/admin/team", label: "Team", icon: UsersIcon },
    { href: "/admin/domains", label: "Domains", icon: GlobeIcon },
    ...(cloud ? [{ href: "/admin/billing", label: "Billing", icon: CreditCardIcon }] : []),
  ],
});

/** Pinned to the bottom of the sidebar: help links that never move. */
const HELP = (supportHref: string): Item[] => [
  { href: "/docs", label: "Documentation", icon: BookOpenIcon, external: true },
  { href: supportHref, label: "Support", icon: LifeBuoyIcon, external: true },
  {
    href: "https://github.com/AhmadHakroosh/bookly",
    label: "GitHub",
    icon: GitHubIcon as unknown as LucideIcon,
    external: true,
  },
];

export function AdminNav({
  cloud = false,
  manager = false,
  tasks = false,
  files = false,
  messages = null,
  supportHref = "https://github.com/AhmadHakroosh/bookly/issues",
}: {
  cloud?: boolean;
  /** The drive is enabled (its feature flag): adds Files after Tasks / Contacts. */
  files?: boolean;
  /** Messages are enabled and on the plan: adds Messages after Contacts, with the unread count. */
  messages?: { unread: number } | null;
  /** The task board is enabled (its feature flag): adds Tasks after Contacts. */
  tasks?: boolean;
  /** Owner or admin: shows the Workspace group. */
  manager?: boolean;
  /** Where "Support" goes: a mailto in cloud mode, the issue tracker when self-hosted. */
  supportHref?: string;
}) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);
  const scheduling =
    tasks || files || messages
      ? GROUPS.map((g, i) =>
          i === 0
            ? {
                ...g,
                items: g.items.flatMap((it) =>
                  it.href === "/admin/contacts"
                    ? [
                        it,
                        ...(messages
                          ? [
                              {
                                href: "/admin/messages",
                                label: "Messages",
                                icon: MessagesSquareIcon,
                                unread: messages.unread,
                              },
                            ]
                          : []),
                        ...(tasks
                          ? [{ href: "/admin/tasks", label: "Tasks", icon: SquareKanbanIcon }]
                          : []),
                        ...(files
                          ? [{ href: "/admin/files", label: "Files", icon: FolderIcon }]
                          : []),
                      ]
                    : [it],
                ),
              }
            : g,
        )
      : GROUPS;
  const groups = manager ? [...scheduling, WORKSPACE(cloud)] : scheduling;
  const itemClass = (on: boolean) =>
    `flex items-center gap-2 rounded-md px-2 py-1.5 ${on ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;
  const External = ({ it }: { it: Item }) => (
    <a href={it.href} target="_blank" rel="noreferrer" className={itemClass(false)}>
      <it.icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{it.label}</span>
      <ExternalLinkIcon className="size-3 opacity-60" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
  return (
    <nav className="flex min-h-full flex-col gap-4 text-sm" aria-label="Admin">
      <Link href="/admin" className={itemClass(active("/admin"))}>
        <HomeIcon className="size-4 shrink-0" aria-hidden />
        Home
      </Link>
      {groups.map((g) => (
        <div key={g.label} className="border-t pt-3">
          <p className="mb-1.5 flex items-center gap-2 px-2 text-xs font-semibold tracking-wider text-foreground uppercase">
            <g.icon className="size-4 text-muted-foreground" aria-hidden />
            {g.label}
          </p>
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.href}>
                {it.external ? (
                  <External it={it} />
                ) : (
                  <Link href={it.href} className={itemClass(active(it.href))}>
                    <it.icon className="size-4 shrink-0" aria-hidden />
                    {it.label}
                    {it.unread !== undefined && <UnreadBadge initial={it.unread} />}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-auto border-t pt-3">
        <p className="mb-1.5 flex items-center gap-2 px-2 text-xs font-semibold tracking-wider text-foreground uppercase">
          <LifeBuoyIcon className="size-4 text-muted-foreground" aria-hidden />
          Help
        </p>
        <ul className="space-y-0.5">
          {HELP(supportHref).map((it) => (
            <li key={it.href}>
              <External it={it} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
