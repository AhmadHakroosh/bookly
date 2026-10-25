import {
  CalendarCheckIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  FolderIcon,
  MailIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  ReceiptIcon,
  SparklesIcon,
  UserRoundCheckIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { MARK } from "@/components/brand/logo";

/**
 * Small, static pieces of the product as the website concepts draw them (the "mini UIs" on
 * Product, Solutions and Trust). Decorative: hidden from assistive technology, because the
 * copy beside each one says the same thing in words. Sample people and amounts only.
 */

function Frame({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`rounded-2xl border bg-card p-4 text-left shadow-[0_18px_40px_-28px_rgb(28_28_28/0.35)] ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        {Icon && <Icon className="size-4 text-(--brand)" />}
      </div>
      {children}
    </div>
  );
}

/** A filled button as a picture (no focusable element inside a decorative mock). */
function FakeButton({ children, ink = false }: { children: React.ReactNode; ink?: boolean }) {
  return (
    <span
      className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold whitespace-nowrap ${ink ? "bg-ink text-ink-foreground" : "bg-primary text-primary-foreground"}`}
    >
      {children}
    </span>
  );
}

export function Initials({ name, className = "" }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <span
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--ink)_70%,var(--reply))] text-xs font-semibold text-white ${className}`}
    >
      {initials}
    </span>
  );
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** "Schedule a session": a month with one chosen day and the open times beside it. */
export function ScheduleMini({ className = "" }: { className?: string }) {
  // November 2026 starts on a Sunday: six blanks, then thirty days.
  const cells = [...Array<null>(6).fill(null), ...Array.from({ length: 30 }, (_, i) => i + 1)];
  return (
    <Frame title="Schedule a session" className={className}>
      <div className="grid grid-cols-[1fr_auto] gap-4">
        <div>
          <p className="mb-2 text-xs font-medium">November 2026</p>
          <div className="grid grid-cols-7 gap-y-1 text-center text-[10px]">
            {DAYS.map((d) => (
              <span key={d} className="text-muted-foreground">
                {d}
              </span>
            ))}
            {cells.map((d, i) => (
              <span
                key={i}
                className={`mx-auto inline-flex size-5 items-center justify-center rounded-md ${d === 18 ? "bg-primary font-semibold text-primary-foreground" : d && d > 15 && i % 7 < 5 ? "font-medium" : "text-muted-foreground"}`}
              >
                {d ?? ""}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 pt-6">
          {["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"].map((t) => (
            <span
              key={t}
              className={`rounded-md border px-3 py-1 text-center text-[11px] font-medium ${t === "11:00 AM" ? "border-primary bg-primary text-primary-foreground" : ""}`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** The pre-call briefing card: who, what happened last, what they shared. */
export function BriefingMini({ className = "" }: { className?: string }) {
  const rows: [LucideIcon, string, string][] = [
    [MessageSquareIcon, "Past conversations", "3 meetings · last on Nov 4"],
    [NotebookPenIcon, "What they asked when booking", "Rebrand, go-to-market, Q3 launch"],
    [FolderIcon, "Shared files", "Brand brief, research deck, 2 more"],
  ];
  return (
    <Frame title="Pre-call briefing" icon={FileTextIcon} className={className}>
      <div className="flex items-center gap-3 rounded-xl border p-3">
        <Initials name="Maya Chen" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Maya Chen</p>
          <p className="text-xs text-muted-foreground">
            Northstar Studio ·{" "}
            <span className="rounded-full bg-success-muted px-1.5 py-0.5 text-[10px] font-medium text-success">
              Active client
            </span>
          </p>
        </div>
      </div>
      <ul className="mt-2 divide-y">
        {rows.map(([Icon, title, line]) => (
          <li key={title} className="flex items-center gap-3 py-2.5">
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
    </Frame>
  );
}

/** The recap after the call: decisions and action items, each traced to the conversation. */
export function RecapMini({ className = "" }: { className?: string }) {
  return (
    <Frame title="Meeting recap" icon={SparklesIcon} className={className}>
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
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
      <p className="mt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Action items
      </p>
      <ul className="mt-1.5 space-y-1.5 text-xs">
        {[
          ["Send the strategy proposal", "You · Today"],
          ["Share two case studies", "Maya · Friday"],
        ].map(([t, who]) => (
          <li key={t} className="flex items-center gap-2">
            <span className="size-3.5 shrink-0 rounded border" />
            <span className="flex-1">{t}</span>
            <span className="text-[11px] whitespace-nowrap text-muted-foreground">{who}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** The follow-up email, written from the recap, with the proposal attached. */
export function FollowUpMini({ className = "" }: { className?: string }) {
  return (
    <Frame title="Follow-up email" icon={MailIcon} className={className}>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-12 text-muted-foreground">To</span>
          <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5">
            Maya Chen <XIcon className="size-3" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 text-muted-foreground">Subject</span>
          <span className="flex-1 rounded-md border px-2 py-0.5">Your next steps, Maya</span>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Hi Maya, it was great speaking with you yesterday. I&apos;ve attached the proposed scope and
        timeline, based on our conversation.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border p-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent">
          <FileTextIcon className="size-3.5 text-(--brand)" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">Strategy proposal.pdf</span>
          <span className="block text-[11px] text-muted-foreground">
            $1,200 · Strategy engagement
          </span>
        </span>
      </div>
      <div className="mt-3 flex justify-end">
        <FakeButton>Review &amp; send</FakeButton>
      </div>
    </Frame>
  );
}

/** A payment request through the host's own Stripe account. */
export function PaymentMini({ className = "" }: { className?: string }) {
  return (
    <Frame title="Payment request" icon={ReceiptIcon} className={className}>
      <div className="rounded-xl border p-3">
        <p className="text-xs text-muted-foreground">Strategy engagement · Maya Chen</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">$1,200.00</p>
        <div className="mt-3 space-y-1.5">
          <span className="block h-1.5 w-3/4 rounded-full bg-muted" />
          <span className="block h-1.5 w-1/2 rounded-full bg-muted" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Paid into your Stripe account</span>
        <FakeButton>Send request</FakeButton>
      </div>
    </Frame>
  );
}

/** "Call notes" (Home): the notes taken during the call, beside its action items. */
export function CallNotesMini({ className = "" }: { className?: string }) {
  return (
    <Frame title="Call notes" className={className}>
      <div className="flex gap-4 border-b text-xs">
        <span className="-mb-px border-b-2 border-primary pb-2 font-medium text-primary">
          Notes
        </span>
        <span className="pb-2 text-muted-foreground">Action items</span>
      </div>
      <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs">
        {[
          "Maya shared their Q3 goals",
          "Focus on brand positioning and messaging",
          "Need a go-to-market plan",
          "Budget around $1–2K",
          "Will share case studies by Friday",
        ].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Frame>
  );
}

/** "Client timeline" (Home): the journey so far, done steps ticked, the current one in orange. */
export function JourneyTimelineMini({ className = "" }: { className?: string }) {
  const steps: [string, string, "done" | "now" | "next"][] = [
    ["Discovery call completed", "May 6, 2026", "done"],
    ["Recap sent", "May 6, 2026", "done"],
    ["Proposal sent", "May 7, 2026", "now"],
    ["Invoice paid", "Pending", "next"],
  ];
  return (
    <Frame title="Client timeline" className={className}>
      <ol>
        {steps.map(([t, when, state], i) => (
          <li key={t} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && (
              <span
                className={`absolute top-6 bottom-0 left-[11px] w-px ${state === "done" ? "bg-success" : "bg-border"}`}
              />
            )}
            <span
              className={`relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${state === "done" ? "border-success bg-success text-white" : state === "now" ? "border-primary bg-card" : "bg-card"}`}
            >
              {state === "done" && <CheckIcon className="size-3.5" strokeWidth={3} />}
              {state === "now" && <span className="size-2.5 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium">{t}</span>
              <span className="block text-[11px] text-muted-foreground">{when}</span>
            </span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

export type TimelineStep = { title: string; when: string; icon: LucideIcon; done?: boolean };

/** "Client timeline": every step of one relationship, in order. */
export function TimelineMini({
  title = "Client timeline",
  steps,
  className = "",
}: {
  title?: string;
  steps: TimelineStep[];
  className?: string;
}) {
  return (
    <Frame title={title} className={className}>
      <ol className="space-y-3">
        {steps.map(({ title: t, when, icon: Icon, done = true }) => (
          <li key={t} className="flex items-start gap-3">
            <span
              className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md border ${done ? "bg-card" : "border-dashed text-muted-foreground"}`}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium">{t}</span>
              <span className="block text-[11px] text-muted-foreground">{when}</span>
            </span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** The person card beside a timeline: who, their role and what is attached to them. */
export function PersonMini({
  name,
  role,
  counts,
  className = "",
}: {
  name: string;
  role: string;
  counts: [string, string][];
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`rounded-2xl border bg-card p-4 text-center shadow-[0_18px_40px_-28px_rgb(28_28_28/0.35)] ${className}`}
    >
      <Initials name={name} className="mx-auto size-14 text-base" />
      <p className="mt-2 text-sm font-semibold">{name}</p>
      <p className="text-xs text-muted-foreground">{role}</p>
      <ul className="mt-4 space-y-2 text-left text-xs">
        {counts.map(([label, n]) => (
          <li key={label} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="rounded-md bg-muted px-1.5 font-medium">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const CLIENT_STEPS: TimelineStep[] = [
  { title: "Booking confirmed", when: "Nov 18, 9:00 AM", icon: CalendarCheckIcon },
  { title: "Briefing ready", when: "Nov 18, 9:12 AM", icon: FileTextIcon },
  { title: "Meeting completed", when: "Nov 18, 10:03 AM", icon: UsersIcon },
  { title: "Follow-up sent", when: "Nov 18, 10:15 AM", icon: MailIcon },
  { title: "Payment request sent", when: "Nov 18, 10:16 AM", icon: ReceiptIcon },
];

export const HIRING_STEPS: TimelineStep[] = [
  { title: "Application received", when: "Oct 12 · confirmation sent", icon: MailIcon },
  { title: "Reviews submitted", when: "2 of 3 · independent", icon: ClipboardCheckIcon },
  { title: "Interview booked", when: "Tue 10:00 · panel of 2", icon: CalendarCheckIcon },
  { title: "Decision recorded", when: "By Dana Ruiz, with a reason", icon: UserRoundCheckIcon },
  { title: "Status updated", when: "The applicant sees it", icon: CheckIcon, done: false },
];

/**
 * The ownership layers (Trust & ownership): your data on top of your application, the Bookly
 * platform, and the environment it runs in, which can be yours.
 */
export function LayersMini({ className = "" }: { className?: string }) {
  const layers = [
    { label: "Your data", fill: "var(--brand)", y: 0 },
    { label: "Your application", fill: "var(--reply)", y: 44 },
    { label: "Bookly platform", fill: "color-mix(in oklch, var(--ink) 18%, white)", y: 88 },
    { label: "Your environment", fill: "var(--ink)", y: 132 },
  ];
  // An isometric slab: top face, then two side faces a shade darker.
  const slab = (y: number, fill: string, i: number) => (
    <g key={i} transform={`translate(0 ${y})`}>
      <path d="M110 40 L200 80 L110 120 L20 80 Z" fill={fill} />
      <path
        d="M20 80 L110 120 L110 134 L20 94 Z"
        fill={`color-mix(in oklch, ${fill} 82%, black)`}
      />
      <path
        d="M200 80 L110 120 L110 134 L200 94 Z"
        fill={`color-mix(in oklch, ${fill} 70%, black)`}
      />
    </g>
  );
  return (
    <svg viewBox="0 0 400 290" aria-hidden className={className}>
      {[...layers].reverse().map((l, i) => slab(l.y, l.fill, i))}
      {/* The mark's b, white, on the top layer. */}
      <path d={MARK.b} transform="translate(98 62) scale(0.34)" fill="white" />
      {layers.map((l) => (
        <g key={l.label}>
          <line
            x1="200"
            y1={l.y + 80}
            x2="236"
            y2={l.y + 80}
            stroke="currentColor"
            strokeOpacity="0.25"
          />
          <circle cx="240" cy={l.y + 80} r="3.5" fill="var(--brand)" />
          <text
            x="252"
            y={l.y + 84}
            fontSize="14"
            fill="currentColor"
            fontFamily="var(--font-sans)"
          >
            {l.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
