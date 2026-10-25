import {
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ClipboardCheckIcon,
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
  type LucideIcon,
} from "lucide-react";

/*
 * The admin's navigation as the concepts draw it (planning/v2/ux/concept-fidelity.md §2): no
 * group headings, only a divider between the primary items and the scheduling items, Settings
 * and Team pinned to the bottom. A workspace in the hiring beta switches between two sidebars,
 * Clients and Hiring (D1). The sidebar, the breadcrumb and ⌘K all read this file, so a page
 * added here is also reachable by search and named in the breadcrumb.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Messages: the unread count, kept live by the notification stream. */
  unread?: number;
  /** A count that needs the member (reviews owed), read with the page. */
  count?: number;
  /** Extra words ⌘K matches on ("schedule" finds Availability). */
  keywords?: string;
  /** Other pages this item stands for in the sidebar: Availability is also Routing's tab. */
  also?: string[];
};

export type Solution = "clients" | "hiring";

/** A block of the sidebar: `primary` on top, `scheduling` after a divider, `bottom` pinned. */
export type NavSection = { id: "primary" | "scheduling" | "bottom"; items: NavItem[] };

export type NavOptions = {
  cloud?: boolean;
  /** Owner or admin: Settings and Team at the bottom. */
  manager?: boolean;
  /** An outside reviewer or interviewer (ADR 0005): only their own profile and schedule. */
  collaborator?: boolean;
  /** The task board is enabled (its feature flag). */
  tasks?: boolean;
  /** The drive is enabled (its feature flag). */
  files?: boolean;
  /** Messages are enabled and on the plan, with the unread count. */
  messages?: { unread: number } | null;
  /** The `hiring` flag is on for this workspace: the Clients | Hiring switch. */
  hiring?: boolean;
  /** Reviews the member owes, beside Reviews in the hiring sidebar. */
  reviewsOwed?: number;
};

/** What a collaborator sees in 1.0: their own profile, schedule and connections. */
const COLLABORATOR: NavItem[] = [
  { href: "/admin/profile", label: "Profile", icon: UserIcon },
  { href: "/admin/availability", label: "Availability", icon: CalendarClockIcon },
  {
    href: "/admin/calendars",
    label: "Calendars & conferencing",
    icon: CalendarDaysIcon,
    also: ["/admin/conferencing"],
  },
  { href: "/admin/notifications", label: "Notifications", icon: BellIcon },
];

const shared = (o: NavOptions): NavItem[] => [
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
    ? [{ href: "/admin/files", label: "Files", icon: FolderIcon, keywords: "drive documents" }]
    : []),
];

const bottom = (o: NavOptions): NavItem[] =>
  o.manager
    ? [
        {
          href: "/admin/settings",
          label: "Settings",
          icon: SettingsIcon,
          keywords: "workspace integrations api privacy brand emails",
          // Domains is a Brand & communications tab that lives outside /admin/settings.
          also: ["/admin/domains"],
        },
        { href: "/admin/team", label: "Team", icon: UsersIcon, keywords: "members invite" },
      ]
    : [];

/** The sidebar for one solution. */
export function navSections(o: NavOptions, solution: Solution = "clients"): NavSection[] {
  if (o.collaborator) return [{ id: "primary", items: COLLABORATOR }];
  if (solution === "hiring" && o.hiring)
    return [
      {
        id: "primary",
        items: [
          {
            href: "/admin/hiring",
            label: "Overview",
            icon: HomeIcon,
            keywords: "hiring candidates cohorts applications",
          },
          {
            href: "/admin/hiring/opportunities",
            label: "Opportunities",
            icon: BriefcaseIcon,
            keywords: "fellowship internship program admissions jobs selection round",
          },
          {
            href: "/admin/hiring/candidates",
            label: "Candidates",
            icon: UsersIcon,
            keywords: "applicants applications people",
          },
          {
            href: "/admin/hiring/interviews",
            label: "Interviews",
            icon: CalendarIcon,
            keywords: "interview schedule panel",
          },
          {
            href: "/admin/hiring/reviews",
            label: "Reviews",
            icon: ClipboardCheckIcon,
            keywords: "review scorecard feedback owed",
            count: o.reviewsOwed,
          },
          ...shared(o).filter((i) => i.href !== "/admin/tasks"),
        ],
      },
      { id: "bottom", items: bottom(o) },
    ];
  return [
    {
      id: "primary",
      items: [
        { href: "/admin", label: "Home", icon: HomeIcon, keywords: "dashboard today" },
        { href: "/admin/bookings", label: "Bookings", icon: CalendarIcon, keywords: "meetings" },
        { href: "/admin/contacts", label: "Contacts", icon: UsersIcon, keywords: "clients people" },
        ...shared(o),
      ],
    },
    {
      id: "scheduling",
      items: [
        { href: "/admin/profile", label: "Booking page", icon: UserIcon, keywords: "profile" },
        { href: "/admin/event-types", label: "Event types", icon: LayoutGridIcon },
        {
          href: "/admin/availability",
          label: "Availability",
          icon: CalendarClockIcon,
          keywords: "hours schedule overrides priority routing",
          also: ["/admin/routing"],
        },
      ],
    },
    { id: "bottom", items: bottom(o) },
  ];
}

/** Hiring's own pages; every other page belongs to client work or to both. */
export const solutionOf = (pathname: string): Solution | null =>
  pathname === "/admin/hiring" || pathname.startsWith("/admin/hiring/")
    ? "hiring"
    : ["/admin/messages", "/admin/files", "/admin/settings", "/admin/team"].some(
          (p) => pathname === p || pathname.startsWith(`${p}/`),
        )
      ? null
      : "clients";

/**
 * Every page the member can open, for ⌘K and the breadcrumb: both sidebars, plus the pages the
 * concepts keep off the sidebar until Settings is regrouped (§4.11): connections, domains and
 * billing.
 */
export function navPages(o: NavOptions): { item: NavItem; solution: Solution }[] {
  const seen = new Set<string>();
  const out: { item: NavItem; solution: Solution }[] = [];
  const add = (item: NavItem, solution: Solution) => {
    if (seen.has(item.href)) return;
    seen.add(item.href);
    out.push({ item, solution });
  };
  for (const sec of navSections(o, "clients")) for (const i of sec.items) add(i, "clients");
  if (o.hiring && !o.collaborator)
    for (const sec of navSections(o, "hiring")) for (const i of sec.items) add(i, "hiring");
  if (!o.collaborator) {
    // A tab of Availability & routing (`mocks.png` 03), not a sidebar item of its own.
    add(
      { href: "/admin/routing", label: "Routing", icon: SplitIcon, keywords: "forms questions" },
      "clients",
    );
    add(
      {
        href: "/admin/calendars",
        label: "Calendars & conferencing",
        icon: CalendarDaysIcon,
        keywords: "google outlook connect zoom meet teams video conferencing",
      },
      "clients",
    );
  }
  if (o.manager) {
    add(
      { href: "/admin/domains", label: "Domains", icon: GlobeIcon, keywords: "custom domain" },
      "clients",
    );
    if (o.cloud)
      add(
        {
          href: "/admin/billing",
          label: "Billing",
          icon: CreditCardIcon,
          keywords: "plan invoice",
        },
        "clients",
      );
  }
  return out;
}

/** Each side's home (Home, Hiring's Overview) is active only on itself, not on the pages below it. */
const HOMES = new Set(["/admin", "/admin/hiring"]);

export const isActive = (pathname: string, href: string) =>
  HOMES.has(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

/** The page a path belongs to (the longest matching href), with its solution. */
export function findNav(o: NavOptions, pathname: string) {
  let best: { item: NavItem; solution: Solution } | null = null;
  for (const p of navPages(o))
    if (isActive(pathname, p.item.href) && p.item.href.length > (best?.item.href.length ?? -1))
      best = p;
  return best;
}

export type Crumb = { label: string; href?: string; current?: boolean };

/** Ids (uuids, nanoids) are not words: the page title names the thing, the trail stops before. */
const isId = (s: string) => /^[0-9a-f-]{16,}$/i.test(s) || (s.length >= 12 && /\d/.test(s));
const words = (s: string) => {
  const t = decodeURIComponent(s).replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Sub-pages whose address is not their name: the Privacy tab lives at /data. */
const SEGMENT: Record<string, string> = {
  "/admin/settings/api": "API",
  "/admin/settings/data": "Privacy",
};

/** Pages outside the sidebar that still deserve a name. */
const OWN: Record<string, string> = {
  "/admin/account": "Account",
  "/admin/notifications": "Notifications",
};

/**
 * The breadcrumb for a path, as the concepts write it: "Workspace / Home", "Hiring /
 * Opportunities / 2027 Fellowship". The root, the page, then sub-pages up to the first id.
 */
export function trail(pathname: string, nav: NavOptions): Crumb[] {
  const hit = findNav(nav, pathname);
  const own = Object.keys(OWN).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hiring = hit?.solution === "hiring";
  const out: Crumb[] = [
    hiring ? { label: "Hiring", href: "/admin/hiring" } : { label: "Workspace", href: "/admin" },
  ];
  const page = own ? { href: own, label: OWN[own]! } : hit?.item;
  if (page) out.push({ label: page.label, href: page.href });
  let href = page?.href ?? "/admin";
  let whole = true;
  for (const seg of pathname.slice(href.length).split("/").filter(Boolean)) {
    href = `${href}/${seg}`;
    if (isId(seg)) {
      whole = false;
      break;
    }
    out.push({ label: SEGMENT[href] ?? words(seg), href });
  }
  // On a page below the trail (a contact, a booking), every crumb stays a link back up.
  if (whole && out.length > 1) out[out.length - 1] = { ...out.at(-1)!, current: true };
  return out;
}
