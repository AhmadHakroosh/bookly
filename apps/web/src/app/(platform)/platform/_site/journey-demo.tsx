"use client";

import { useEffect, useRef, useState } from "react";
import {
  BoldIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CreditCardIcon,
  FileTextIcon,
  FolderIcon,
  HomeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MessageSquareIcon,
  MoreVerticalIcon,
  NotebookPenIcon,
  SquareCheckIcon,
  UnderlineIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { LogoMark } from "@/components/brand/logo";

/*
 * The Home concept's centrepiece (`marketing ui 2.png`): the client journey Booked → Paid above
 * the contact workspace, as an interactive demo with sample data. Each step is a tab: choosing
 * it shows where Maya is in the journey (the timeline), the screen for that step (booking,
 * briefing, notes, follow-up, payment) and what to do next. Sample people, dates and amounts.
 */

type Step = { n: string; title: string; line: string };

const STEPS: Step[] = [
  { n: "01", title: "Booked", line: "Meeting scheduled" },
  { n: "02", title: "Prepared", line: "Briefing ready" },
  { n: "03", title: "Met", line: "Notes captured" },
  { n: "04", title: "Followed up", line: "Proposal sent" },
  { n: "05", title: "Paid", line: "Invoice complete" },
];

const EVENTS: [string, string, string][] = [
  ["Discovery call booked", "May 2, 2026 · 4:10 PM", "Booked from your page; intake answered."],
  ["Briefing ready", "May 6, 2026 · 9:00 AM", "Past conversations, goals and shared files."],
  [
    "Discovery call completed",
    "May 6, 2026 · 10:00 AM",
    "Brand strategy, goals and timeline. Good fit.",
  ],
  ["Proposal sent", "May 7, 2026 · 9:14 AM", "Strategy engagement, $1,200."],
  ["Invoice paid", "May 12, 2026 · 2:30 PM", "Paid by card into your Stripe account."],
];

const NEXT: { title: string; due: string; items: [string, boolean][] }[] = [
  {
    title: "Prepare for Maya's call",
    due: "Due May 6",
    items: [
      ["Review intake answers", true],
      ["Read the briefing", false],
      ["Join the call", false],
    ],
  },
  {
    title: "Join the discovery call",
    due: "Today, 10:00",
    items: [
      ["Read the briefing", true],
      ["Note three questions", true],
      ["Join the call", false],
    ],
  },
  {
    title: "Send strategy proposal",
    due: "Due today",
    items: [
      ["Review the recap", true],
      ["Draft proposal", false],
      ["Send to Maya", false],
      ["Follow up in 3 days", false],
    ],
  },
  {
    title: "Send strategy proposal",
    due: "Due today",
    items: [
      ["Draft proposal", true],
      ["Send to Maya", false],
      ["Follow up in 3 days", false],
      ["Update project status", false],
    ],
  },
  {
    title: "Kick off the project",
    due: "Next week",
    items: [
      ["Payment received", true],
      ["Book the first working session", false],
      ["Share the project plan", false],
    ],
  },
];

const NAV: [LucideIcon, string][] = [
  [HomeIcon, "Home"],
  [CalendarIcon, "Bookings"],
  [UsersIcon, "Contacts"],
  [MessageSquareIcon, "Messages"],
  [SquareCheckIcon, "Tasks"],
  [FolderIcon, "Files"],
];

const TABS = ["Overview", "Conversations", "Notes", "Files", "Proposals", "Invoices"];

/** A button as a picture: the demo shows actions, it doesn't take them. */
function Fake({
  children,
  tone = "primary",
  className,
}: {
  children: React.ReactNode;
  tone?: "primary" | "ink" | "outline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold whitespace-nowrap",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "ink" && "bg-ink text-ink-foreground",
        tone === "outline" && "border bg-background",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {aside}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function BookingPanel() {
  return (
    <Panel
      title="Booking confirmed"
      aside={<span className="text-xs text-success">Confirmed</span>}
    >
      <p className="font-semibold">Discovery call</p>
      <p className="text-xs text-muted-foreground">Maya Chen · Northstar Studio</p>
      <div className="mt-4 space-y-2.5 text-xs">
        <p className="flex items-center gap-2">
          <CalendarIcon className="size-4 text-muted-foreground" />
          Tue, May 6, 2026 · 10:00 – 10:45 AM (PDT)
        </p>
        <p className="flex items-center gap-2">
          <VideoIcon className="size-4 text-muted-foreground" />
          Google Meet · meet.google.com/nst-chen
        </p>
        <p className="flex items-center gap-2">
          <ClockIcon className="size-4 text-muted-foreground" />
          45 min · reminders 24 h and 1 h before
        </p>
      </div>
      <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs">
        <p className="font-medium">What would you like to discuss?</p>
        <p className="mt-1 text-muted-foreground">
          Repositioning the studio before our Q3 launch, and whether a go-to-market plan fits the
          budget.
        </p>
      </div>
      <div className="mt-4 flex gap-2">
        <Fake tone="ink">
          <VideoIcon className="size-3.5" />
          Join meeting
        </Fake>
        <Fake tone="outline">Reschedule</Fake>
      </div>
    </Panel>
  );
}

function BriefingPanel() {
  const rows: [LucideIcon, string, string][] = [
    [MessageSquareIcon, "Past conversations", "2 emails · intake answered May 2"],
    [NotebookPenIcon, "Key details", "Rebrand, go-to-market, Q3 launch"],
    [FolderIcon, "Shared files", "Brand brief, research deck"],
  ];
  return (
    <Panel title="Pre-call briefing" aside={<FileTextIcon className="size-4 text-(--brand)" />}>
      <p className="text-xs text-muted-foreground">
        Written from Maya&apos;s timeline an hour before the call.
      </p>
      <ul className="mt-3 divide-y rounded-lg border">
        {rows.map(([Icon, title, line]) => (
          <li key={title} className="flex items-center gap-3 px-3 py-2.5">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted">
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium">{title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{line}</span>
            </span>
            <ChevronRightIcon className="size-3.5 text-muted-foreground" />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs font-medium">Goals for the call</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
        <li>Agree on what the repositioning covers</li>
        <li>Check the Q3 launch date and budget</li>
      </ul>
    </Panel>
  );
}

function NotesPanel() {
  return (
    <Panel
      title="Call notes"
      aside={<span className="text-xs text-muted-foreground">Transcribed with consent</span>}
    >
      <div className="flex gap-4 border-b text-xs">
        <span className="-mb-px border-b-2 border-primary pb-2 font-medium text-primary">
          Notes
        </span>
        <span className="pb-2 text-muted-foreground">Action items</span>
      </div>
      <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs">
        <li>Maya shared their Q3 goals</li>
        <li>Focus on brand positioning and messaging</li>
        <li>Need a go-to-market plan</li>
        <li>Budget around $1–2K</li>
        <li>Will share case studies by Friday</li>
      </ul>
      <p className="mt-4 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Decisions
      </p>
      <ul className="mt-1.5 space-y-1.5 text-xs">
        {["Start with brand positioning", "Three working sessions over six weeks"].map((d) => (
          <li key={d} className="flex items-start gap-2">
            <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
            {d}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function FollowUpPanel() {
  return (
    <Panel
      title="Follow-up email"
      aside={<span className="text-xs text-muted-foreground">Use a template ▾</span>}
    >
      <div className="space-y-2">
        <Row label="To">
          <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5">
            Maya Chen <XIcon className="size-3" />
          </span>
        </Row>
        <Row label="Subject">
          <span className="block rounded-md border px-2 py-1">Your next steps, Maya</span>
        </Row>
      </div>
      <div className="mt-3 space-y-2 text-xs leading-relaxed">
        <p>Hi Maya,</p>
        <p>
          It was great speaking with you yesterday. I&apos;ve attached the proposed scope and
          timeline for our strategy engagement, based on our conversation.
        </p>
        <p className="hidden sm:block">
          It covers brand positioning, a go-to-market plan and three working sessions over the next
          six weeks.
        </p>
        <p>
          Best,
          <br />
          Jordan
        </p>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border p-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent">
          <FileTextIcon className="size-3.5 text-(--brand)" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            Strategy engagement proposal.pdf
          </span>
          <span className="block text-[11px] text-muted-foreground">
            $1,200 · Strategy engagement
          </span>
        </span>
        <XIcon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex gap-2.5 text-muted-foreground" aria-hidden>
          <BoldIcon className="size-3.5" />
          <ItalicIcon className="size-3.5" />
          <UnderlineIcon className="size-3.5" />
          <ListIcon className="size-3.5" />
          <ListOrderedIcon className="size-3.5" />
          <LinkIcon className="size-3.5" />
        </span>
        <Fake>Review &amp; send ↗</Fake>
      </div>
    </Panel>
  );
}

function PaymentPanel() {
  return (
    <Panel title="Payment request" aside={<CreditCardIcon className="size-4 text-(--brand)" />}>
      <div className="rounded-lg border p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Strategy engagement · Maya Chen</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">$1,200.00</p>
          </div>
          <span className="rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success">
            Paid
          </span>
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <Row label="Sent">May 7, 2026</Row>
          <Row label="Paid">May 12, 2026 · Visa •••• 4242</Row>
          <Row label="Into">Your Stripe account</Row>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        The receipt went to Maya, the payment is on her timeline, and the proposal is marked won.
      </p>
      <div className="mt-4 flex gap-2">
        <Fake tone="outline">View receipt</Fake>
        <Fake tone="outline">Book first session</Fake>
      </div>
    </Panel>
  );
}

const PANELS = [BookingPanel, BriefingPanel, NotesPanel, FollowUpPanel, PaymentPanel];

export function JourneyDemo() {
  const [step, setStep] = useState(3);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const strip = useRef<HTMLDivElement>(null);
  // On a phone the strip scrolls sideways: keep the chosen step in view (the strip only, never
  // the page).
  useEffect(() => {
    const el = tabs.current[step];
    const box = strip.current;
    if (!el || !box || box.scrollWidth <= box.clientWidth) return;
    box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, [step]);
  const Middle = PANELS[step]!;
  const next = NEXT[step]!;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % STEPS.length
        : e.key === "ArrowLeft"
          ? (i - 1 + STEPS.length) % STEPS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? STEPS.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    setStep(to);
    tabs.current[to]?.focus();
  };

  return (
    <div className="rounded-3xl border bg-card/60 p-2 shadow-[0_30px_80px_-50px_rgb(28_28_28/0.45)] sm:p-3">
      <div
        ref={strip}
        role="tablist"
        aria-label="The client journey"
        className="relative flex [scrollbar-width:none] gap-1 overflow-x-auto rounded-2xl p-1"
      >
        {STEPS.map((s, i) => {
          const active = i === step;
          return (
            <div key={s.n} className="flex shrink-0 items-center gap-1 lg:flex-1">
              <button
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`journey-tab-${i}`}
                aria-selected={active}
                aria-controls="journey-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => setStep(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={cn(
                  "flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-accent" : "hover:bg-muted/70",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
                    active && "border-primary bg-primary text-primary-foreground",
                    i < step && "border-foreground/30",
                  )}
                >
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-semibold", active && "text-primary")}>
                    {s.title}
                  </span>
                  <span className="block text-xs whitespace-nowrap text-muted-foreground">
                    {s.line}
                  </span>
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRightIcon
                  className="hidden size-4 shrink-0 text-muted-foreground lg:block"
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>

      <div
        id="journey-panel"
        role="tabpanel"
        aria-labelledby={`journey-tab-${step}`}
        className="mt-2 flex overflow-hidden rounded-2xl border bg-background"
      >
        {/* The app's sidebar, as a picture of where this lives. */}
        <div className="hidden w-44 shrink-0 border-r bg-sidebar p-4 md:block" aria-hidden>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <LogoMark className="h-5 w-auto" />
            Bookly
          </p>
          <ul className="mt-6 space-y-1 text-sm">
            {NAV.map(([Icon, label]) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5",
                  label === "Contacts"
                    ? "bg-accent font-medium text-primary"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 px-5 pt-5">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--ink)_55%,var(--reply))] text-sm font-semibold text-white">
              MC
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                Maya Chen
                <span className="rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success">
                  {step === 4 ? "Client" : "Active client"}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">Northstar Studio</p>
            </div>
            <MoreVerticalIcon className="ms-auto size-4 text-muted-foreground" aria-hidden />
          </div>
          <div
            className="mt-3 flex [scrollbar-width:none] gap-5 overflow-x-auto border-b px-5 text-sm"
            aria-hidden
          >
            {TABS.map((t) => (
              <span
                key={t}
                className={cn(
                  "-mb-px shrink-0 border-b-2 pb-2.5",
                  t === "Overview"
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {t}
              </span>
            ))}
          </div>

          <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[1fr_1.35fr_0.95fr]">
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-3 text-sm font-semibold">Recent activity</p>
              <ol className="relative">
                {EVENTS.map(([title, when, line], i) => {
                  const done = i < step;
                  const current = i === step;
                  return (
                    <li key={title} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < EVENTS.length - 1 && (
                        <span
                          className={cn(
                            "absolute top-6 bottom-0 left-[11px] w-px",
                            done ? "bg-success" : "bg-border",
                          )}
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          "relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                          done && "border-success bg-success text-white",
                          current && "border-primary bg-background",
                          !done && !current && "bg-background",
                        )}
                      >
                        {done && <CheckIcon className="size-3.5" strokeWidth={3} />}
                        {current && <span className="size-2.5 rounded-full bg-primary" />}
                        <span className="sr-only">
                          {done ? "Done" : current ? "Now" : "Not yet"}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {i <= step ? when : "Not yet completed"}
                        </span>
                        {i <= step && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{line}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="min-w-0">
              <Middle />
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-4">
                <p className="mb-3 text-sm font-semibold">Next step</p>
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                    <SquareCheckIcon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{next.title}</span>
                    <span className="block text-xs text-primary">{next.due}</span>
                  </span>
                </div>
                <ul className="mt-3 space-y-2 text-xs">
                  {next.items.map(([label, done]) => (
                    <li key={label} className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex size-4 shrink-0 items-center justify-center rounded border",
                          done && "border-success bg-success text-white",
                        )}
                      >
                        {done && <CheckIcon className="size-3" strokeWidth={3} />}
                        <span className="sr-only">{done ? "Done:" : "To do:"}</span>
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hidden rounded-xl border bg-card p-4 sm:block">
                <p className="mb-3 text-sm font-semibold">Client details</p>
                <div className="space-y-1.5">
                  <Row label="Email">maya@northstar.studio</Row>
                  <Row label="Company">Northstar Studio</Row>
                  <Row label="Industry">Creative agency</Row>
                  <Row label="Location">San Francisco, CA</Row>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
