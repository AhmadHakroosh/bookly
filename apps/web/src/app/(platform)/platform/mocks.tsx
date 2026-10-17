import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BanknoteIcon,
  BellIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CheckIcon,
  ClipboardCheckIcon,
  DoorOpenIcon,
  FileTextIcon,
  HomeIcon,
  LayoutGridIcon,
  MailIcon,
  NotebookPenIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Static, light-themed reproductions of real Bookly screens for the landing page. They use the
 * same components and classes as the admin so what visitors see is what they get.
 */

export function BrowserFrame({
  url,
  children,
  className = "",
}: {
  url: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`force-light overflow-hidden rounded-xl border border-black/10 bg-background text-foreground shadow-2xl shadow-black/20 ${className}`}
    >
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-black/15" />
          <span className="size-2.5 rounded-full bg-black/15" />
          <span className="size-2.5 rounded-full bg-black/15" />
        </span>
        <span className="mx-auto rounded-md bg-background px-3 py-0.5 text-[11px] text-muted-foreground">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}

const NAV = [
  ["Home", HomeIcon, true],
  ["Booking page", UserIcon],
  ["Event types", LayoutGridIcon],
  ["Availability", CalendarClockIcon],
  ["Bookings", CalendarIcon],
  ["Contacts", UsersIcon],
  ["Notifications", BellIcon],
  ["Calendars", CalendarDaysIcon],
  ["Conferencing", VideoIcon],
  ["Settings", SettingsIcon],
] as const;

function Sidebar() {
  return (
    <aside className="hidden w-44 shrink-0 border-r p-3 text-xs md:block">
      <p className="mb-2 px-2 font-semibold">Hakroosh Consulting</p>
      <ul className="space-y-0.5">
        {NAV.map(([label, Icon, on]) => (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${on ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Home as the host sees it on a normal Tuesday. */
/** The Home dashboard's cards as the mock shows them: title, the number, one line of context. */
const MOCK_CARDS: [string, string, string][] = [
  ["This week", "7", "Today 10:00 · Lina Farah"],
  ["Since your last visit", "3", "new bookings · 1 cancellation"],
  ["Needs attention", "4", "1 request · 1 recap · 2 follow-ups"],
  ["Your tasks", "5", "open · 1 overdue"],
  ["Contacts", "6", "new this week · 2 follow-ups due"],
  ["Payments this month", "$1,840", "12 paid bookings"],
];

export function HomeMock({ dashboard = false }: { dashboard?: boolean }) {
  return (
    <BrowserFrame url="acme.bookly-app.io/admin">
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1 space-y-5 p-5 text-sm">
          <div>
            <p className="text-xl font-semibold tracking-tight">Home</p>
            <p className="text-xs text-muted-foreground">
              Tue, Sep 22 · 2 meetings today · 1 request · 1 overdue task · 2 to follow up
            </p>
          </div>
          {dashboard && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {MOCK_CARDS.map(([title, big, sub]) => (
                <div key={title} className="rounded-xl border p-3">
                  <p className="text-xs font-medium text-muted-foreground">{title}</p>
                  <p className="text-xl font-semibold tracking-tight tabular-nums">{big}</p>
                  <p className="truncate text-xs text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>
          )}
          <section>
            <p className="text-base font-semibold tracking-tight">Recaps to review</p>
            <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="font-medium">Discovery call with Omar Haddad · Mon, 15:00</p>
                <p className="line-clamp-2 text-muted-foreground">
                  Omar wants a booking flow for his three clinics by December. Budget is set; he
                  needs a proposal with two options and a rough timeline.
                </p>
                <p className="text-xs text-muted-foreground">
                  4 action items · next: send proposal
                </p>
              </div>
              <span className="text-xs underline underline-offset-4">Review</span>
            </div>
          </section>
          <section className="border-t pt-4">
            <p className="text-base font-semibold tracking-tight">Today</p>
            <ul className="mt-2 divide-y rounded-xl border">
              {[
                [
                  "10:00",
                  "Intro call with Lina Farah",
                  "Warm lead from the routing form; asked about a marketplace MVP.",
                ],
                [
                  "14:30",
                  "Working session with Acme Ltd (3 seats)",
                  "Session 2 of 6. Last time: API docs were late; ask about staging access.",
                ],
              ].map(([t, title, brief]) => (
                <li key={t} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t} · {title}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{brief}</p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs underline underline-offset-4">
                    <span>Join</span>
                    <span>Brief</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
            <section>
              <p className="text-base font-semibold tracking-tight">Follow up</p>
              <ul className="mt-2 divide-y rounded-xl border">
                {[
                  ["Sara Cohen · Northwind", "Proposal sent 6 days ago, no reply", "lead"],
                  ["Yusuf Ali", "Follow-up due today", "active"],
                ].map(([who, why, stage]) => (
                  <li key={who} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="font-medium">{who}</p>
                      <p className="text-xs text-muted-foreground">{why}</p>
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {stage}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border p-3">
              <p className="text-base font-semibold tracking-tight">Tasks</p>
              <ul className="mt-2 space-y-1.5">
                {[
                  ["Send Omar two proposal options", "due tomorrow", false],
                  ["Chase Acme for staging access", "due yesterday", true],
                  ["Book Lina's follow-up", "", false],
                ].map(([t, due, late]) => (
                  <li key={t as string} className="flex items-center gap-2">
                    <span className="size-4 rounded border" aria-hidden />
                    <span className="flex-1">
                      {t}
                      {due && (
                        <span
                          className={`ml-2 text-xs ${late ? "text-red-700" : "text-muted-foreground"}`}
                        >
                          {due}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

export function BriefMock() {
  return (
    <div
      aria-hidden
      className="force-light rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15"
    >
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold tracking-tight">Briefing</p>
        <Badge variant="outline">
          <FileTextIcon className="mr-1 size-3" aria-hidden />
          1h before
        </Badge>
      </div>
      <p className="mt-2 leading-relaxed">
        Omar Haddad, Haddad Dental (3 clinics), stage lead. You spoke once in June about replacing
        their phone-based booking; he was worried about no-shows. Since then he filled the routing
        form asking for &ldquo;online booking + reminders for three locations&rdquo; and mentioned a
        December deadline. Open item from last time: you promised a reference from a similar clinic.
        Prepare: the reference, a two-option price range, and a question about who handles the front
        desk today.
      </p>
    </div>
  );
}

export function CallMock() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border border-black/10 bg-black text-white shadow-xl shadow-black/15"
    >
      <div className="flex items-center justify-between px-4 py-2 text-xs">
        <span className="font-medium">Discovery call with Omar Haddad</span>
        <span className="text-white/60">Mon, 15:00</span>
      </div>
      <p className="bg-amber-500/20 px-4 py-1 text-center text-[11px] text-amber-200">
        This call is transcribed so both sides get notes and action items afterwards.
      </p>
      <div className="grid grid-cols-2 gap-2 p-3">
        {["Ahmad", "Omar"].map((n) => (
          <div
            key={n}
            className="flex aspect-video items-end rounded-lg bg-white/10 p-2 text-[11px]"
          >
            {n}
          </div>
        ))}
      </div>
      <ul className="space-y-1 border-t border-white/10 px-4 py-3 font-mono text-[11px] text-white/80">
        <li>[12:04] Omar: we need this live before the December rush</li>
        <li>[12:31] Ahmad: I&apos;ll send two options by Wednesday</li>
        <li>[13:02] Omar: our front desk will send the patient list</li>
      </ul>
    </div>
  );
}

export function RecapMock({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-hidden
      className="force-light space-y-4 rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15"
    >
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold tracking-tight">Meeting recap</p>
        <Badge variant="outline">warm</Badge>
      </div>
      <p className="leading-relaxed">
        Omar wants online booking with reminders for three clinics before December. Budget is set;
        he needs a proposal with two options. His front desk will share the patient list.
      </p>
      {!compact && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            What he asked for
          </p>
          <ul className="mt-1 space-y-1">
            {[
              ["Online booking for three clinics", true],
              ["Reminders that cut no-shows", true],
              ["Insurance integration", false],
            ].map(([t, ok]) => (
              <li key={t as string} className="flex items-center gap-2">
                <span
                  className={`flex size-4 items-center justify-center rounded-full border ${ok ? "bg-foreground text-background" : ""}`}
                  aria-hidden
                >
                  {ok && <CheckIcon className="size-3" />}
                </span>
                {t}
                {!ok && <span className="text-muted-foreground">· not covered</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Action items
        </p>
        <ul className="mt-1 space-y-1.5">
          {[
            [
              "Send two proposal options",
              "in 2 days",
              "[12:31] “I’ll send two options by Wednesday”",
            ],
            [
              "Omar: share the patient list",
              "in 7 days",
              "[13:02] “our front desk will send the patient list”",
            ],
            ["Find a clinic reference", null, null],
          ].map(([t, due, q]) => (
            <li key={t as string} className="flex items-start gap-2">
              <span
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border bg-foreground text-background"
                aria-hidden
              >
                <CheckIcon className="size-3" />
              </span>
              <span>
                {t}
                {due && <span className="text-muted-foreground"> · {due}</span>}
                {q && <span className="block text-xs text-muted-foreground">{q}</span>}
              </span>
            </li>
          ))}
        </ul>
        <Button tabIndex={-1} className="pointer-events-none mt-2">
          Create all tasks
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
        <p>
          <span className="font-medium">Next step: </span>proposal by Wednesday
          <span className="block text-muted-foreground">Suggested stage: active</span>
        </p>
        <Button variant="outline" tabIndex={-1} className="pointer-events-none">
          Move to active
        </Button>
      </div>
    </div>
  );
}

export function AvailabilityMock() {
  const rows: [string, string, boolean][] = [
    ["Mon", "09:00 – 12:00", false],
    ["Mon", "13:00 – 17:00", true],
    ["Tue", "10:00 – 16:00", false],
    ["Wed", "09:00 – 17:00", true],
    ["Thu", "10:00 – 16:00", false],
  ];
  return (
    <div
      aria-hidden
      className="force-light rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15"
    >
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs">
          <span className="block font-medium">Meetings per week (budget)</span>
          <span className="mt-1 block h-8 w-24 rounded-lg border px-2 leading-8">8</span>
        </label>
        <p className="text-xs text-muted-foreground">
          Focus ranges and time past the budget are offered only to priority contacts.
        </p>
      </div>
      <ul className="mt-3 divide-y rounded-xl border">
        {rows.map(([d, r, focus], i) => (
          <li key={i} className="flex items-center gap-3 p-2.5">
            <span className="w-10 text-muted-foreground">{d}</span>
            <span className="flex-1 font-mono text-xs">{r}</span>
            <label
              className={`inline-flex items-center gap-1 text-xs ${focus ? "" : "text-muted-foreground"}`}
            >
              <span
                className={`flex size-3.5 items-center justify-center rounded border ${focus ? "bg-foreground text-background" : ""}`}
                aria-hidden
              >
                {focus && <CheckIcon className="size-2.5" />}
              </span>
              focus
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContactMock() {
  const events = [
    [CalendarPlusIcon, "Booked Discovery call for Mon, Sep 21, 15:00", "2 days ago"],
    [ClipboardCheckIcon, 'Filled the "How can we help?" form · Team size: 50+', "9 days ago"],
    [MailIcon, "Proposal sent: Booking flow for Haddad Dental", "June"],
    [NotebookPenIcon, "Worried about no-shows; wants SMS reminders", "June"],
    [ArrowRightIcon, "Stage: lead → active", "June"],
  ] as const;
  return (
    <div
      aria-hidden
      className="force-light rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold tracking-tight">Omar Haddad</p>
          <p className="text-xs text-muted-foreground">
            omar@haddad-dental.example · Haddad Dental · 3 bookings
          </p>
        </div>
        <div className="flex gap-1">
          <Badge variant="outline">vip</Badge>
          <Badge>Active</Badge>
        </div>
      </div>
      <ol className="mt-4 space-y-2.5">
        {events.map(([Icon, text, when]) => (
          <li key={text} className="flex gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              {text}
              <span className="block text-xs text-muted-foreground">{when}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BookingPageMock() {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const open = [22, 23, 24, 29, 30];
  return (
    <div
      aria-hidden
      className="force-light rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Ahmad Hakroosh</p>
          <p className="text-base font-semibold tracking-tight">Working session</p>
          <p className="mt-1 text-xs text-muted-foreground">
            60 min · Video call · Group of up to 3
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          6 sessions
        </Badge>
      </div>
      <p className="mt-2 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
        Every week, 6 times. One booking reserves the whole series.
      </p>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="font-medium">September 2026</span>
        <span className="text-muted-foreground">Tue 22</span>
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1 text-center text-[10px] tabular-nums">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-muted-foreground/70">
            {d}
          </span>
        ))}
        {days.map((d) => (
          <span
            key={d}
            className={`flex h-6 items-center justify-center rounded ${open.includes(d) ? "bg-muted font-medium" : "text-muted-foreground"} ${d === 22 ? "ring-1 ring-foreground" : ""}`}
          >
            {d}
          </span>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-1.5 text-center text-xs">
        {(
          [
            ["12:00", "2 seats left"],
            ["13:00", "3 seats left"],
            ["14:00", "Full · waitlist"],
          ] as [string, string][]
        ).map(([t, n]) => (
          <li
            key={t}
            className={`rounded-lg border px-1 py-1.5 ${n.startsWith("Full") ? "border-dashed text-muted-foreground" : ""}`}
          >
            <span className="block font-medium">{t}</span>
            <span className="block text-[10px] font-normal text-muted-foreground">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The bookings calendar as the tour shows it: a work week with tinted blocks. */
export function CalendarMock() {
  const days = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16"];
  // [day index, start hour, length in hours, title, colour]
  const blocks: [number, number, number, string, string][] = [
    [0, 9, 1, "Intro · Lina Farah", "#2563eb"],
    [0, 14, 1.5, "Working session · 3/4", "#16a34a"],
    [1, 10, 0.5, "Check-in · Omar", "#d97706"],
    [2, 9.5, 1, "Intro · Sara Cohen", "#2563eb"],
    [2, 13, 2, "Workshop · 6/8", "#9333ea"],
    [3, 11, 1, "Discovery · Yusuf Ali", "#2563eb"],
    [4, 9, 1.5, "Working session · 4/4", "#16a34a"],
    [4, 15, 0.5, "Check-in · Acme", "#d97706"],
  ];
  const from = 8;
  const hours = 9;
  const H = 26;
  return (
    <BrowserFrame url="acme.bookly-app.io/admin/bookings">
      <div className="space-y-3 p-4 text-xs">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold tracking-tight">Oct 12 – 16</p>
          <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Week</span>
        </div>
        <div className="grid grid-cols-5 gap-px overflow-hidden rounded-lg border bg-border">
          {days.map((d, di) => (
            <div key={d} className="bg-background">
              <p className="border-b py-1 text-center text-muted-foreground">{d}</p>
              <div className="relative" style={{ height: hours * H }}>
                {blocks
                  .filter((b) => b[0] === di)
                  .map(([, start, len, title, color]) => (
                    <div
                      key={title}
                      className="absolute inset-x-1 overflow-hidden rounded border-l-[3px] px-1 py-0.5 leading-tight"
                      style={{
                        top: (start - from) * H,
                        height: len * H - 2,
                        borderLeftColor: color,
                        background: `color-mix(in oklab, ${color} 22%, transparent)`,
                      }}
                    >
                      {title}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

/** The bell's panel in the admin with a desktop notification arriving over it. */
export function NotificationsMock() {
  const items: [typeof BellIcon, string, string, string, boolean][] = [
    [DoorOpenIcon, "Lina Farah joined your call", "Intro call · now", "now", true],
    [CalendarPlusIcon, "Omar Haddad booked a Working session", "Thu, Oct 22, 10:00", "4 min", true],
    [BanknoteIcon, "Acme paid $450.00", "Payment request", "1 h", false],
    [FileTextIcon, "Recap ready: Sara Cohen", "Agreed on a two-week pilot…", "3 h", false],
  ];
  return (
    <div className="relative" aria-hidden>
      <BrowserFrame url="acme.bookly-app.io/admin">
        <div className="flex items-center justify-between border-b px-4 py-2.5 text-xs">
          <span className="font-semibold">Acme Advisory</span>
          <span className="relative flex size-7 items-center justify-center rounded-md bg-muted">
            <BellIcon className="size-4" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--brand) px-1 text-[10px] font-semibold text-neutral-950">
              2
            </span>
          </span>
        </div>
        <div className="flex justify-end p-4 pt-2">
          <div className="w-72 overflow-hidden rounded-lg border bg-popover text-xs shadow-md">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="font-medium">Notifications</span>
              <span className="text-muted-foreground">Mark all read</span>
            </div>
            {items.map(([Icon, title, body, when, unread]) => (
              <div
                key={title}
                className={`flex gap-2.5 border-b px-3 py-2 last:border-b-0 ${unread ? "bg-(--brand)/5" : ""}`}
              >
                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate ${unread ? "font-medium" : ""}`}>{title}</p>
                  <p className="truncate text-muted-foreground">
                    {body} · {when}
                  </p>
                </div>
                {unread && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-(--brand)" />}
              </div>
            ))}
          </div>
        </div>
      </BrowserFrame>
      <div className="force-light absolute -top-4 -left-3 flex w-64 gap-2.5 rounded-xl border border-black/10 bg-background/95 p-3 text-xs text-foreground shadow-xl backdrop-blur sm:-left-6">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <VideoIcon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="font-medium">Lina Farah joined your call</p>
          <p className="text-muted-foreground">Bookly · Intro call, 14:00</p>
        </div>
      </div>
    </div>
  );
}

/** The task board: workspace-defined columns, cards from meeting recaps, one being dragged. */
export function TaskBoardMock() {
  const columns: [string, string, [string, string, string][]][] = [
    [
      "Inquiry",
      "#71717a",
      [
        ["Send pricing to Acme", "Lina · due Fri", ""],
        ["Book discovery with Yusuf", "Omar", ""],
      ],
    ],
    ["Quoted", "#2563eb", [["Follow up on the pilot proposal", "Sara · from the recap", "drag"]]],
    ["Booked", "#16a34a", [["Kick-off pack for Northwind", "Lina · 2 comments", ""]]],
  ];
  return (
    <BrowserFrame url="acme.bookly-app.io/admin/tasks">
      <div className="flex gap-2.5 p-4 text-xs">
        {columns.map(([name, color, cards]) => (
          <div key={name} className="min-w-0 flex-1 space-y-2 rounded-lg border bg-muted/30 p-2">
            <p className="flex items-center gap-1.5 font-semibold">
              <span className="size-2 rounded-full" style={{ background: color }} />
              {name}
              <span className="ml-auto font-normal text-muted-foreground">{cards.length}</span>
            </p>
            {cards.map(([title, meta, state]) => (
              <div
                key={title}
                className={`rounded-md border bg-background p-2 ${state === "drag" ? "translate-x-1 -rotate-2 shadow-lg ring-2 ring-(--brand)/40" : ""}`}
              >
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-muted-foreground">{meta}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

/** A contact's timeline: a day divider, a meeting with its recap, an email with the guest's reply. */
export function TimelineMock() {
  return (
    <BrowserFrame url="acme.bookly-app.io/admin/contacts/lina-farah">
      <div className="space-y-3 p-4 text-xs">
        <p className="text-base font-semibold tracking-tight">Lina Farah · Northwind</p>
        <p className="flex items-center gap-2 font-medium tracking-wide text-muted-foreground uppercase">
          Today <span className="h-px flex-1 bg-border" />
        </p>
        <div className="flex gap-2.5">
          <MailIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="flex justify-between gap-2">
              <span>Proposal sent: Pilot for Q1</span>
              <span className="text-muted-foreground">09:12</span>
            </p>
            <div className="space-y-1 border-l-2 pl-2.5">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Lina Farah</span> replied · 11:40
              </p>
              <p>Looks good. Can we start the week of the 2nd?</p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">You</span> answered · 11:52
              </p>
              <p>Yes, I have put it in the calendar.</p>
            </div>
          </div>
        </div>
        <p className="flex items-center gap-2 font-medium tracking-wide text-muted-foreground uppercase">
          Tuesday, October 13 <span className="h-px flex-1 bg-border" />
        </p>
        <div className="flex gap-2.5">
          <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p>Discovery call took place</p>
            <p className="space-x-2 text-muted-foreground underline underline-offset-2">
              <span>Discovery call</span>
              <span>Recap</span>
              <span>Transcript</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <BanknoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p>Paid $450.00 (payment request)</p>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** The drive: spaces on the left, a contact's folder with what they sent and what is ours. */
export function DriveMock() {
  const files: [string, string, string][] = [
    ["signed-agreement.pdf", "from Lina, with her reply", "2.1 MB"],
    ["brand-guidelines.zip", "from Lina", "14 MB"],
    ["pilot-proposal.pdf", "sent with the proposal", "380 KB"],
    ["kickoff-notes.docx", "on the task “Prepare kick-off”", "64 KB"],
  ];
  return (
    <BrowserFrame url="acme.bookly-app.io/admin/files">
      <div className="grid grid-cols-[110px_1fr] gap-3 p-4 text-xs">
        <div className="space-y-1 text-muted-foreground">
          {["My files", "Team", "Contacts", "Recent", "Trash"].map((n) => (
            <p
              key={n}
              className={`rounded px-2 py-1 ${n === "Contacts" ? "bg-muted font-medium text-foreground" : ""}`}
            >
              {n}
            </p>
          ))}
        </div>
        <div className="min-w-0 space-y-2">
          <p>
            <span className="text-muted-foreground">Contacts /</span>{" "}
            <span className="font-medium">Lina Farah</span>
          </p>
          <div className="divide-y rounded-lg border">
            {files.map(([name, meta, size]) => (
              <div key={name} className="flex items-center gap-2 px-2.5 py-2">
                <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <p className="truncate text-muted-foreground">{meta}</p>
                </div>
                <span className="text-muted-foreground">{size}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** Messages: one conversation per client, emails in and out with an internal note between. */
export function MessagesMock() {
  const threads: [string, string, boolean][] = [
    ["Lina Farah", "Great, see you then!", true],
    ["Launch plan", "Second thought: ship Monday.", false],
    ["Omar Haddad", "Thanks for the recap.", false],
  ];
  return (
    <BrowserFrame url="acme.bookly-app.io/admin/messages">
      <div className="grid grid-cols-[130px_1fr] gap-3 p-4 text-xs">
        <div className="space-y-1">
          {threads.map(([name, preview, unread]) => (
            <div
              key={name}
              className={`rounded px-2 py-1.5 ${name === "Lina Farah" ? "bg-muted" : ""}`}
            >
              <p className={`truncate ${unread ? "font-semibold" : ""}`}>{name}</p>
              <p className="truncate text-muted-foreground">{preview}</p>
            </div>
          ))}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Lina Farah</span> · When booking
            </p>
            <p>Could we talk about pricing?</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Sam</span> · Email sent
            </p>
            <p>Yes, pricing is on the agenda.</p>
          </div>
          <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-2 dark:bg-amber-950/20">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Rana</span> · Internal note
            </p>
            <p>@Sam she asked about pricing twice; offer the pack.</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Lina Farah</span> · Email received
            </p>
            <p>Great, see you then!</p>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}
