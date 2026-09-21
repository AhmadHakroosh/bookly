import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BellIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CheckIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  InboxIcon,
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
  ["Inbox", InboxIcon, true],
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
      <p className="mb-2 px-2 font-semibold">Dana Weiss Consulting</p>
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

/** The Meeting Inbox as the host sees it on a normal Tuesday. */
export function InboxMock() {
  return (
    <BrowserFrame url="app.bookly.app/admin">
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1 space-y-5 p-5 text-sm">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Inbox</h3>
            <p className="text-xs text-muted-foreground">
              Tue, Sep 22 · 2 meetings today · 1 request · 1 overdue task · 2 to follow up
            </p>
          </div>
          <section>
            <h4 className="text-base font-semibold tracking-tight">Recaps to review</h4>
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
            <h4 className="text-base font-semibold tracking-tight">Today</h4>
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
              <h4 className="text-base font-semibold tracking-tight">Follow up</h4>
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
              <h4 className="text-base font-semibold tracking-tight">Tasks</h4>
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
                          className={`ml-2 text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}
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
    <div className="force-light rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold tracking-tight">Briefing</h4>
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
    <div className="overflow-hidden rounded-xl border border-black/10 bg-black text-white shadow-xl shadow-black/15">
      <div className="flex items-center justify-between px-4 py-2 text-xs">
        <span className="font-medium">Discovery call with Omar Haddad</span>
        <span className="text-white/60">Mon, 15:00</span>
      </div>
      <p className="bg-amber-500/20 px-4 py-1 text-center text-[11px] text-amber-200">
        This call is transcribed so both sides get notes and action items afterwards.
      </p>
      <div className="grid grid-cols-2 gap-2 p-3">
        {["Dana", "Omar"].map((n) => (
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
        <li>[12:31] Dana: I&apos;ll send two options by Wednesday</li>
        <li>[13:02] Omar: our front desk will send the patient list</li>
      </ul>
    </div>
  );
}

export function RecapMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="force-light space-y-4 rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold tracking-tight">Meeting recap</h4>
        <Badge variant="outline">warm</Badge>
      </div>
      <p className="leading-relaxed">
        Omar wants online booking with reminders for three clinics before December. Budget is set;
        he needs a proposal with two options. His front desk will share the patient list.
      </p>
      {!compact && (
        <div>
          <h5 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            What he asked for
          </h5>
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
        <h5 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Action items
        </h5>
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
              <input type="checkbox" defaultChecked readOnly className="mt-1" aria-hidden />
              <span>
                {t}
                {due && <span className="text-muted-foreground"> · {due}</span>}
                {q && <span className="block text-xs text-muted-foreground">{q}</span>}
              </span>
            </li>
          ))}
        </ul>
        <Button size="sm" className="pointer-events-none mt-2">
          Create all tasks
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
        <p>
          <span className="font-medium">Next step: </span>proposal by Wednesday
          <span className="block text-muted-foreground">Suggested stage: active</span>
        </p>
        <Button size="sm" variant="outline" className="pointer-events-none">
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
    <div className="force-light rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15">
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
    <div className="force-light rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold tracking-tight">Omar Haddad</h4>
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
  return (
    <div className="force-light grid gap-4 rounded-xl border border-black/10 bg-background p-4 text-sm text-foreground shadow-xl shadow-black/15 sm:grid-cols-[1fr_1fr_120px]">
      <div>
        <p className="text-xs text-muted-foreground">Dana Weiss</p>
        <h4 className="text-base font-semibold tracking-tight">Working session</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          60 min · Video call · Group of up to 3
          <br />
          Every week, 6 times. One booking reserves the whole series.
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium">September 2026</p>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
          {days.map((d) => (
            <span
              key={d}
              className={`rounded py-1 ${[22, 23, 24, 29, 30].includes(d) ? "bg-muted font-medium" : "text-muted-foreground/60"} ${d === 22 ? "ring-1 ring-foreground" : ""}`}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
      <ul className="space-y-1.5 text-center text-xs">
        {(
          [
            ["12:00", "2 seats left"],
            ["13:00", ""],
            ["14:00", "Full · waitlist"],
          ] as [string, string][]
        ).map(([t, n]) => (
          <li
            key={t}
            className={`rounded-lg border px-2 py-1.5 ${n.startsWith("Full") ? "border-dashed text-muted-foreground" : ""}`}
          >
            {t}
            {n && <span className="block text-[10px] font-normal text-muted-foreground">{n}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
