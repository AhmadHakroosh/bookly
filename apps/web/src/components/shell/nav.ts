import {
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CreditCardIcon,
  FolderIcon,
  GlobeIcon,
  HomeIcon,
  LayoutGridIcon,
  MessagesSquareIcon,
  SettingsIcon,
  SplitIcon,
  SquareKanbanIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";

/*
 * The admin's navigation, grouped by the job (bookly-ux v2 IA): Work, Hiring, Scheduling and
 * Workspace. The sidebar, the breadcrumb and ⌘K all read it from here, so a page added to the
 * nav is also reachable by search and named in the breadcrumb.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Messages: the unread count, kept live by the notification stream. */
  unread?: number;
  /** Extra words ⌘K matches on ("schedule" finds Availability). */
  keywords?: string;
};

export type NavGroup = {
  id: "work" | "hiring" | "scheduling" | "workspace" | "you";
  label: string;
  items: NavItem[];
};

export type NavOptions = {
  cloud?: boolean;
  /** Owner or admin: shows the Workspace group. */
  manager?: boolean;
  /** An outside reviewer or interviewer (ADR 0005): only their own profile and schedule. */
  collaborator?: boolean;
  /** The task board is enabled (its feature flag). */
  tasks?: boolean;
  /** The drive is enabled (its feature flag). */
  files?: boolean;
  /** Messages are enabled and on the plan, with the unread count. */
  messages?: { unread: number } | null;
  /** The `hiring` flag is on for this workspace. */
  hiring?: boolean;
};

/** What a collaborator sees in 1.0: their own profile, schedule and connections. */
const COLLABORATOR: NavGroup = {
  id: "you",
  label: "You",
  items: [
    { href: "/admin/profile", label: "Profile", icon: UserIcon },
    { href: "/admin/availability", label: "Availability", icon: CalendarClockIcon },
    { href: "/admin/calendars", label: "Calendars", icon: CalendarDaysIcon },
    { href: "/admin/conferencing", label: "Conferencing", icon: VideoIcon },
    { href: "/admin/notifications", label: "Notifications", icon: BellIcon },
  ],
};

export function navGroups(o: NavOptions): NavGroup[] {
  if (o.collaborator) return [COLLABORATOR];
  const groups: NavGroup[] = [
    {
      id: "work",
      label: "Work",
      items: [
        { href: "/admin", label: "Home", icon: HomeIcon, keywords: "dashboard today" },
        { href: "/admin/bookings", label: "Bookings", icon: CalendarIcon, keywords: "meetings" },
        { href: "/admin/contacts", label: "Contacts", icon: UsersIcon, keywords: "clients people" },
        ...(o.messages
          ? [
              {
                href: "/admin/messages",
                label: "Messages",
                icon: MessagesSquareIcon,
                unread: o.messages.unread,
                keywords: "conversations inbox",
              },
            ]
          : []),
        ...(o.tasks
          ? [{ href: "/admin/tasks", label: "Tasks", icon: SquareKanbanIcon, keywords: "to-do" }]
          : []),
        ...(o.files
          ? [
              {
                href: "/admin/files",
                label: "Files",
                icon: FolderIcon,
                keywords: "drive documents",
              },
            ]
          : []),
      ],
    },
  ];
  if (o.hiring)
    groups.push({
      id: "hiring",
      label: "Hiring",
      items: [
        {
          href: "/admin/hiring",
          label: "Overview",
          icon: BriefcaseIcon,
          keywords: "hiring opportunities candidates cohorts applications",
        },
      ],
    });
  groups.push({
    id: "scheduling",
    label: "Scheduling",
    items: [
      { href: "/admin/profile", label: "Booking page", icon: UserIcon, keywords: "profile" },
      { href: "/admin/event-types", label: "Event types", icon: LayoutGridIcon },
      {
        href: "/admin/availability",
        label: "Availability",
        icon: CalendarClockIcon,
        keywords: "hours schedule",
      },
      { href: "/admin/routing", label: "Routing forms", icon: SplitIcon },
      {
        href: "/admin/calendars",
        label: "Calendars",
        icon: CalendarDaysIcon,
        keywords: "google outlook",
      },
      {
        href: "/admin/conferencing",
        label: "Conferencing",
        icon: VideoIcon,
        keywords: "zoom meet video",
      },
    ],
  });
  if (o.manager)
    groups.push({
      id: "workspace",
      label: "Workspace",
      items: [
        {
          href: "/admin/settings",
          label: "Settings",
          icon: SettingsIcon,
          keywords: "branding emails",
        },
        { href: "/admin/team", label: "Team", icon: UsersIcon, keywords: "members invite" },
        { href: "/admin/domains", label: "Domains", icon: GlobeIcon },
        ...(o.cloud
          ? [{ href: "/admin/billing", label: "Billing", icon: CreditCardIcon, keywords: "plan" }]
          : []),
      ],
    });
  return groups;
}

export const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

/** The nav item a path belongs to (the longest matching href), with its group. */
export function findNav(groups: NavGroup[], pathname: string) {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of groups)
    for (const item of group.items)
      if (isActive(pathname, item.href) && item.href.length > (best?.item.href.length ?? -1))
        best = { group, item };
  return best;
}

export type Crumb = { label: string; href?: string; current?: boolean };

/** Ids (uuids, nanoids) are not words: the page title names the thing, the trail stops before. */
const isId = (s: string) => /^[0-9a-f-]{16,}$/i.test(s) || (s.length >= 12 && /\d/.test(s));
const words = (s: string) => {
  const t = decodeURIComponent(s).replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Pages outside the nav that still deserve a name. */
const OWN: Record<string, Crumb[]> = {
  "/admin/account": [{ label: "You" }, { label: "Account", href: "/admin/account" }],
  "/admin/notifications": [
    { label: "You" },
    { label: "Notifications", href: "/admin/notifications" },
  ],
};

/** The breadcrumb for a path: group, page, then sub-pages up to the first id. */
export function trail(pathname: string, nav: NavOptions): Crumb[] {
  const own = Object.keys(OWN).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hit = findNav(navGroups(nav), pathname);
  const base: Crumb[] = own
    ? OWN[own]!
    : hit
      ? [{ label: hit.group.label }, { label: hit.item.label, href: hit.item.href }]
      : [];
  const from = own ?? hit?.item.href ?? "/admin";
  const rest = pathname.slice(from.length).split("/").filter(Boolean);
  const out = [...base];
  let href = from;
  let whole = true;
  for (const seg of rest) {
    href = `${href}/${seg}`;
    if (isId(seg)) {
      whole = false;
      break;
    }
    out.push({ label: words(seg), href });
  }
  // On a page below the trail (a contact, a booking), every crumb stays a link back up.
  if (whole && out.length) out[out.length - 1] = { ...out.at(-1)!, current: true };
  return out;
}
