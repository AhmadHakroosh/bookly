import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CalendarRangeIcon,
  CheckIcon,
  CodeIcon,
  CreditCardIcon,
  DatabaseIcon,
  GlobeIcon,
  MinusIcon,
  RepeatIcon,
  ShieldCheckIcon,
  SplitIcon,
  UsersIcon,
  VideoIcon,
  WebhookIcon,
  type LucideIcon,
} from "lucide-react";
import { PLANS } from "@bookly/cloud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AvailabilityMock,
  BookingPageMock,
  BriefMock,
  ContactMock,
  HomeMock,
  RecapMock,
  CalendarMock,
  NotificationsMock,
  TaskBoardMock,
  TimelineMock,
  DriveMock,
  MessagesMock,
  NotesMock,
} from "./mocks";
import { EmailMock, FollowUpMock, LiveTranscriptMock, RoutingMock, SeatsMock } from "./mocks-more";
import { PlanGrid } from "./plan-card";
import { faqLd, JsonLd, organizationLd, softwareLd, websiteLd } from "./json-ld";
import { CtaBand, StraightAnswers } from "./_site/ui";
import { HOME_FAQ } from "./_site/faq";
import { pageMetadata, SITE } from "./site";
import { Suspense } from "react";
import { flagOnForEveryone } from "@/server/flags";

export const metadata: Metadata = pageMetadata({ absoluteTitle: `${SITE.name} — ${SITE.tagline}` });

const AUDIENCE = ["Consultants", "Coaches", "Agencies", "Freelancers", "Advisors", "Sales teams"];

const LIFECYCLE = ["Booked", "Briefed", "Captured", "Recapped", "Followed up"];

const TABLE_STAKES: [LucideIcon, string, string][] = [
  [
    CalendarRangeIcon,
    "Availability that fits real life",
    "Weekly hours, date overrides, buffers, notice and horizon rules, timezone-aware for visitors.",
  ],
  [
    UsersIcon,
    "Group sessions",
    "Seats per slot, seats-left on the page, one shared meeting link, a waitlist when full.",
  ],
  [
    RepeatIcon,
    "Recurring series",
    "One booking reserves six sessions; each has its own link, reminders and notes.",
  ],
  [
    SplitIcon,
    "Routing forms",
    "Ask two questions, send people to the right event type, link or message.",
  ],
  [
    CalendarCheckIcon,
    "Calendar sync",
    "Google and Outlook conflicts respected, with push notifications so changes count instantly.",
  ],
  [
    VideoIcon,
    "Video, your way",
    "Google Meet, Zoom, Teams, or Bookly video. Every one of them can transcribe the call.",
  ],
  [
    CreditCardIcon,
    "Paid bookings",
    "Stripe Checkout for single calls and whole series, refunds on cancel, payment requests later.",
  ],
  [
    BellRingIcon,
    "Reminders that land",
    "Email, SMS and WhatsApp reminders, follow-ups, no-show tracking, pings when someone joins.",
  ],
  [
    WebhookIcon,
    "API and webhooks",
    "Scoped keys, signed events for bookings, contacts and tasks, an embeddable widget.",
  ],
  [GlobeIcon, "Your domain", "book.yourname.com with automatic HTTPS, or a subdomain in seconds."],
  [
    ShieldCheckIcon,
    "Abuse controls",
    "Blocklists, per-form throttles and booking quotas so a public page stays usable.",
  ],
  [
    DatabaseIcon,
    "Your data, your call",
    "Export the whole workspace as JSON, delete it or your account in one click, transcripts expire on your schedule.",
  ],
];

const INTEGRATIONS = [
  "Google Calendar",
  "Outlook",
  "Google Meet",
  "Zoom",
  "Microsoft Teams",
  "Daily.co",
  "Stripe",
  "HubSpot",
  "Pipedrive",
  "Slack",
  "Twilio",
  "Sent.dm",
  "WhatsApp",
  "Resend",
  "Anthropic",
];

type Cmp = boolean | "some";
const COMPARE: [string, Cmp, Cmp][] = [
  ["Booking pages, calendar sync, reminders", true, true],
  ["Group sessions with seats and a waitlist", "some", true],
  ["Recurring series in one booking", "some", true],
  ["A briefing before every call, from the contact's history", false, true],
  ["Transcription with consent, speaker labels and a live notice", false, true],
  ["Recap where every action item quotes the transcript", false, true],
  ["One click from recap to tasks, stage and follow-up email", false, true],
  ["Availability that treats customers and cold leads differently", false, true],
  ["Contact timeline built in, synced to HubSpot or Pipedrive", false, true],
  ["Branded emails in your name, with wording you control", "some", true],
  ["Export or delete everything yourself, no ticket needed", "some", true],
  ["Self-host the open-source core (AGPL-3.0), no plan limits", false, true],
];

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-16 py-16 md:py-24 ${className}`}>
      <div className="mx-auto max-w-6xl px-4">{children}</div>
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      <span className="size-1.5 rounded-full bg-(--brand)" aria-hidden />
      {children}
    </p>
  );
}

function Feature({
  eyebrow,
  title,
  children,
  mock,
  flip = false,
  bullets,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  mock: React.ReactNode;
  flip?: boolean;
  bullets?: string[];
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`} data-reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">{title}</h2>
        <p className="mt-4 text-muted-foreground">{children}</p>
        {bullets && (
          <ul className="mt-6 space-y-2 text-sm">
            {bullets.map((t) => (
              <li key={t} className="flex gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-(--brand)" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className={`min-w-0 ${flip ? "lg:order-1" : ""}`}
        data-reveal
        style={{ "--reveal-delay": "120ms" } as never}
      >
        {mock}
      </div>
    </div>
  );
}

function CmpCell({ v }: { v: Cmp }) {
  // Every state sits in the same 24px box so the column stays aligned with the row text.
  const box = "inline-flex size-6 items-center justify-center rounded-full align-middle";
  if (v === true)
    return (
      <span className={`${box} bg-(--brand)/15 text-(--brand)`}>
        <CheckIcon className="size-3.5" aria-label="Yes" />
      </span>
    );
  if (v === "some")
    return (
      <span className={`${box} w-auto px-1 text-xs text-muted-foreground`} aria-label="Partly">
        Some
      </span>
    );
  return (
    <span className={`${box} text-muted-foreground/60`}>
      <MinusIcon className="size-4" aria-label="No" />
    </span>
  );
}

export default function LandingPage() {
  return (
    <div>
      <JsonLd
        data={[
          organizationLd(),
          websiteLd(),
          softwareLd(
            Object.values(PLANS).map((p) => ({
              name: p.name,
              priceMonthly: p.priceMonthly,
              priceYearly: p.priceYearly,
            })),
          ),
          faqLd(HOME_FAQ),
        ]}
      />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="marketing-grid absolute inset-0 -z-10" aria-hidden />
        <div className="marketing-glow absolute inset-x-0 top-0 -z-10 h-[520px]" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-10 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="rise-in mb-5 bg-background">
              Open source · self-host or let us host it
            </Badge>
            <h1
              className="rise-in text-4xl font-semibold tracking-tight text-balance md:text-6xl"
              style={{ "--rise-delay": "60ms" } as never}
            >
              The meeting is booked.{" "}
              <span className="text-(--brand)">Bookly handles the rest.</span>
            </h1>
            <p
              className="rise-in mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground md:text-xl"
              style={{ "--rise-delay": "120ms" } as never}
            >
              Scheduling is the entry point. Bookly briefs you before the call, transcribes it with
              consent, and turns every meeting into tasks, follow-ups and a relationship you can
              see.
            </p>
            <div
              className="rise-in mt-8 flex flex-wrap justify-center gap-3"
              style={{ "--rise-delay": "180ms" } as never}
            >
              <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
                Create your booking page
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                className="bg-background"
                render={<Link href="/#compare" />}
              >
                Why not just a scheduler?
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Free plan, no card. Two minutes to your first booking page.
            </p>
          </div>

          {/* Lifecycle strip */}
          <ol
            className="rise-in mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-3 text-sm"
            aria-label="The meeting lifecycle"
            style={{ "--rise-delay": "240ms" } as never}
          >
            {LIFECYCLE.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                  <span
                    className="lifecycle-dot size-2 rounded-full bg-(--brand)"
                    style={{ animationDelay: `${i * 480}ms` }}
                    aria-hidden
                  />
                  {step}
                </span>
                {i < LIFECYCLE.length - 1 && (
                  <ArrowRightIcon className="size-3.5 text-muted-foreground/60" aria-hidden />
                )}
              </li>
            ))}
          </ol>

          <div className="rise-in mt-12" style={{ "--rise-delay": "300ms" } as never}>
            <Suspense fallback={<HomeMock />}>
              <GatedHomeMock />
            </Suspense>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
            <li className="mr-1">Built for people who live off their meetings:</li>
            {AUDIENCE.map((a) => (
              <li key={a}>
                <Badge variant="secondary">{a}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Integrations marquee */}
      <section className="border-y bg-muted/30 py-6" aria-label="Integrations">
        <div className="marquee mx-auto max-w-6xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] px-4">
          <ul className="marquee-track flex w-max gap-3">
            {[...INTEGRATIONS, ...INTEGRATIONS].map((i, idx) => (
              <li
                key={`${i}-${idx}`}
                className="rounded-full border bg-background px-4 py-1.5 text-sm whitespace-nowrap text-muted-foreground"
                aria-hidden={idx >= INTEGRATIONS.length}
              >
                {i}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Before / during / after */}
      <Section id="features">
        <div className="mx-auto max-w-2xl text-center" data-reveal>
          <Eyebrow>Before, during, after</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Other tools stop when the slot is booked. That is where Bookly starts.
          </h2>
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {[
            [
              <BriefMock key="b" />,
              "Walk in prepared",
              "An hour before every call you get a briefing: who they are, what happened last time, what they asked for when booking, what to prepare. Built from their timeline, not from your memory.",
            ],
            [
              <LiveTranscriptMock key="c" />,
              "Take the call, skip the notes",
              "On Bookly video, Meet, Zoom and Teams the call is transcribed with consent and speaker labels. Both sides see the notice. You stay in the conversation instead of typing.",
            ],
            [
              <RecapMock key="r" compact />,
              "Act in a minute, not an afternoon",
              "The recap has decisions and action items for both sides, each with the moment it came from. Create the tasks, move the stage, send the follow-up. One click each.",
            ],
          ].map(([mock, title, text], i) => (
            <div
              key={title as string}
              className="space-y-4"
              data-reveal
              style={{ "--reveal-delay": `${i * 120}ms` } as never}
            >
              {mock}
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Deep dives */}
      <Section className="border-t">
        <Feature
          eyebrow="Recap with evidence"
          title="What was agreed, what they promised, what they pushed back on."
          mock={<RecapMock />}
          bullets={[
            "Did the call cover what they asked for when booking?",
            "Their commitments become tasks you can chase",
            "Objections and open questions get their own list",
            "Follow-up and client recap drafted, you edit and send",
          ]}
        >
          Every item quotes the transcript so you trust it, and so disputes end before they start.
          Deals are lost on the concern nobody wrote down, so the concerns are written down. A
          client-facing recap is one click away.
        </Feature>
      </Section>

      <Section className="border-t">
        <Feature
          eyebrow="Follow-up, already written"
          title="The email goes out while the call is still fresh."
          mock={<FollowUpMock />}
          flip
        >
          Bookly drafts the follow-up from the recap: what you agreed, who does what, by when. Edit
          a line, hit send. Proposals and payment requests start from your templates, show you the
          exact email before it goes, carry a Stripe pay button for the amount, and land on the
          contact&apos;s timeline.
        </Feature>
      </Section>

      <Section className="border-t">
        <Feature
          eyebrow="Emails in your name"
          title="Every email looks like you sent it. Because you did."
          mock={<EmailMock />}
          bullets={[
            "Arrives as “you via your workspace”, replies go straight to your inbox",
            "Your logo, name and colour on your booking pages and every email (Pro and Team; self-hosting includes it)",
            "Your own opening words, with a preview before you save them",
            "A plain-text version travels with every email",
          ]}
        >
          Confirmations, reminders, cancellations, follow-ups and proposals are designed emails, not
          system notices. Guests see your brand and your wording; the details, buttons and calendar
          invitation are added for you.
        </Feature>
      </Section>

      <Suspense fallback={null}>
        <GatedCalendarFeature />
        <GatedNotificationsFeature />
        <GatedTaskBoardFeature />
        <GatedTimelineFeature />
        <GatedFilesFeature />
        <GatedMessagesFeature />
        <GatedNotesFeature />
      </Suspense>

      <Section className="border-t">
        <Feature
          eyebrow="Priority-aware availability"
          title="Your calendar, governed by intent. Not just busy or free."
          mock={<AvailabilityMock />}
        >
          Mark afternoons as focus time and cap meetings per week. New leads see your open hours.
          Existing customers, the people who pay you, still get in. Bookly recognises them by email,
          so the person who matters never hits a wall.
        </Feature>
      </Section>

      <Section className="border-t">
        <Feature
          eyebrow="Contacts and timeline"
          title="Every meeting has a relationship behind it."
          mock={<ContactMock />}
          flip
        >
          One record per person: stage, tags, notes, and a timeline of every booking, email, form
          answer and note. Home tells you who has gone quiet and when to follow up. Sync it to
          HubSpot or Pipedrive if that is where your team lives.
        </Feature>
      </Section>

      <Section className="border-t">
        <div className="mx-auto max-w-2xl text-center" data-reveal>
          <Eyebrow>A booking page that does more</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Group sessions, recurring series, waitlists, routing. On your own domain.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Sell a six-week programme in one booking. Fill a workshop to its last seat and let the
            rest queue. Ask two questions and send each visitor to the right offer.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <div data-reveal>
            <BookingPageMock />
          </div>
          <div data-reveal style={{ "--reveal-delay": "120ms" } as never}>
            <SeatsMock />
          </div>
          <div data-reveal style={{ "--reveal-delay": "240ms" } as never}>
            <RoutingMock />
          </div>
        </div>
      </Section>

      {/* Comparison */}
      <Section id="compare" className="border-t bg-muted/30">
        <div className="mx-auto max-w-2xl text-center" data-reveal>
          <Eyebrow>Why not just a scheduler?</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            A scheduler saves you the back-and-forth. Bookly saves you the meeting.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Most scheduling tools end at the calendar invite. Everything after it, the prep, the
            notes, the follow-up, the memory of who said what, is still on you.
          </p>
        </div>
        <div
          className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border bg-background"
          data-reveal
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium sm:p-4">What you get</th>
                <th className="w-20 p-3 text-center font-medium text-muted-foreground sm:w-32 sm:p-4">
                  <span className="sm:hidden">Others</span>
                  <span className="hidden sm:inline">Typical scheduler</span>
                </th>
                <th className="w-16 p-3 text-center font-medium sm:w-24 sm:p-4">Bookly</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([f, a, b]) => (
                <tr key={f} className="border-b last:border-0">
                  <td className="p-3 align-middle text-pretty sm:p-4">{f}</td>
                  <td className="p-3 text-center align-middle leading-none sm:p-4">
                    <CmpCell v={a} />
                  </td>
                  <td className="p-3 text-center align-middle leading-none sm:p-4">
                    <CmpCell v={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Table stakes grid */}
      <Section className="border-t">
        <div className="mx-auto max-w-2xl text-center" data-reveal>
          <Eyebrow>And everything a booking page should do</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Nothing missing from the basics.
          </h2>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TABLE_STAKES.map(([Icon, t, d], i) => (
            <li
              key={t}
              className="rounded-xl border p-5 transition-colors hover:bg-muted/40"
              data-reveal
              style={{ "--reveal-delay": `${(i % 3) * 80}ms` } as never}
            >
              <Icon className="size-5 text-(--brand)" aria-hidden />
              <h3 className="mt-3 font-semibold tracking-tight">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* Open source */}
      <Section className="border-t">
        <Feature
          eyebrow="Open source"
          title="Your clients' conversations, on your terms."
          mock={
            <pre className="max-w-full min-w-0 rounded-xl border bg-neutral-950 p-5 text-xs leading-relaxed break-all whitespace-pre-wrap text-neutral-200 shadow-xl">
              <span className="text-neutral-400"># four commands to a running Bookly</span>
              {`
git clone ${SITE.github}.git && cd bookly
cp .env.example .env
docker compose --profile app up -d
open http://localhost:3002`}
            </pre>
          }
        >
          Bookly&apos;s core is AGPL-licensed. Run it on your own server with Docker and keep every
          transcript and contact in your own database, or let us host it with backups, updates and
          support. Self-hosted installs get a notice when a new release is out and never share usage
          data unless you opt in. Transcripts expire on the schedule you set, attendees can delete
          theirs, and the AI parts are optional.
        </Feature>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={SITE.github} target="_blank" rel="noreferrer" />}
          >
            <CodeIcon data-icon="inline-start" />
            View on GitHub
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/docs/self-hosting" target="_blank" />}
          >
            Self-hosting guide
          </Button>
        </div>
      </Section>

      {/* Pricing teaser */}
      <Section className="border-t bg-muted/30">
        <div className="mx-auto max-w-2xl text-center" data-reveal>
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Start free. Pay when it pays for itself.
          </h2>
        </div>
        <div className="mt-10">
          <PlanGrid plans={Object.values(PLANS)} reveal />
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/pricing" className="underline underline-offset-4">
            Compare plans in detail
          </Link>
        </p>
      </Section>

      <StraightAnswers items={HOME_FAQ} />
      <CtaBand />
    </div>
  );
}

/** The Home mock shows the dashboard cards once the dashboard is on for every workspace. */
async function GatedHomeMock() {
  return <HomeMock dashboard={await flagOnForEveryone("home_dashboard")} />;
}

/** The calendar in the tour, once the bookings calendar is on for every workspace. */
async function GatedCalendarFeature() {
  if (!(await flagOnForEveryone("bookings_calendar"))) return null;
  return (
    <Section className="border-t">
      <Feature
        eyebrow="Bookings calendar"
        title="See your week at a glance."
        mock={<CalendarMock />}
        flip
      >
        Switch between a list and a day, week or month calendar. Every booking is tinted with its
        event type, group sessions show their seats, and a click opens the booking beside the
        calendar, so you can walk through the week without losing your place.
      </Feature>
    </Section>
  );
}

/** Notifications in the tour, once they are on for every workspace. */
async function GatedNotificationsFeature() {
  if (!(await flagOnForEveryone("notifications"))) return null;
  return (
    <Section className="border-t">
      <Feature
        eyebrow="Notifications"
        title="Never miss a booking or a knock."
        mock={<NotificationsMock />}
        bullets={[
          "A bell with everything that happened, read or not",
          "Desktop notifications, even with every Bookly tab closed",
          "Install Bookly as an app on your computer or phone",
          "Choose per kind: in Bookly, on the desktop, by email",
        ]}
      >
        New bookings, requests, cancellations, a guest waiting in the room, a payment that just
        landed, a recap ready to review: Bookly tells you the moment it happens, where you want to
        hear it.
      </Feature>
    </Section>
  );
}

/** The task board in the tour, once it is on for every workspace. */
async function GatedTaskBoardFeature() {
  if (!(await flagOnForEveryone("task_board"))) return null;
  return (
    <Section className="border-t">
      <Feature
        eyebrow="Task board"
        title="The follow-ups land on a board, not in someone's notes."
        mock={<TaskBoardMock />}
        flip
        bullets={[
          "Columns are your own flow: inquiry, quoted, booked, or whatever your business runs on",
          "Drag cards between columns with a mouse, a finger or the keyboard",
          "Action items from a meeting recap arrive as tasks, linked to the booking and the contact",
          "Assign teammates, @-mention them in comments, share saved views (Team)",
        ]}
      >
        Every promise made on a call becomes a card someone owns. The board shows what is waiting,
        what is stuck and what is done, for you or the whole team.
      </Feature>
    </Section>
  );
}

/** The contact timeline in the tour, once v2 is on for every workspace. */
async function GatedTimelineFeature() {
  if (!(await flagOnForEveryone("timeline_v2"))) return null;
  return (
    <Section className="border-t">
      <Feature
        eyebrow="Contact timeline"
        title="Every email, reply, meeting and payment on one page per client."
        mock={<TimelineMock />}
        bullets={[
          "Grouped by day, newest first, and fast however long the history",
          "Replies to your emails land under the email they answer, no forwarding",
          "Answer from the timeline; the thread stays in one place",
          "Meetings link to their recap and transcript",
        ]}
      >
        The contact page is the memory of the relationship: what was booked, what was said, what was
        promised and what was paid, without digging through an inbox.
      </Feature>
    </Section>
  );
}

/** The drive in the tour, once Files is on for every workspace. */
async function GatedFilesFeature() {
  if (!(await flagOnForEveryone("files"))) return null;
  return (
    <Section className="border-t">
      <Feature
        eyebrow="Files"
        title="Every file a client sends, in their folder."
        mock={<DriveMock />}
        bullets={[
          "Attachments on their replies are kept, linked to the email they came with",
          "A drive for you and your team, and a folder for every contact",
          "Add files to tasks; they land in the contact's folder and timeline",
          "Send files with a proposal or a reply, straight from the drive",
        ]}
      >
        No more digging through an inbox for the contract they sent last month: it is in their
        folder, next to the conversation it came with.
      </Feature>
    </Section>
  );
}

/** Messages in the tour, once they are on for every workspace. */
async function GatedMessagesFeature() {
  if (!(await flagOnForEveryone("messages"))) return null;
  return (
    <Section className="border-t">
      <Feature
        eyebrow="Messages"
        title="One conversation per client, shared by the team."
        mock={<MessagesMock />}
        bullets={[
          "Their emails in and out, and what they wrote when booking, in one thread",
          "Write from Bookly; their reply comes back to the same conversation",
          "Internal notes and @-mentions the client never sees (Team)",
          "Team threads about a client or anything else, with unread counts and live updates",
        ]}
      >
        No more forwarding emails to a colleague or asking in a chat app who answered: the whole
        team sees the conversation, and notes stay beside it.
      </Feature>
    </Section>
  );
}

/** In-meeting notes in the tour, once they are on for every workspace. */
async function GatedNotesFeature() {
  if (!(await flagOnForEveryone("meeting_notes"))) return null;
  return (
    <Section className="border-t">
      <Feature
        eyebrow="Notes in the call"
        title="Your own notes, the transcript and the recap in one place."
        mock={<NotesMock />}
        bullets={[
          "Private notes beside the call, each stamped with the moment you wrote it",
          "Mark a moment with one click or a shortcut, and come back to it later",
          "The recap reads your notes with the transcript; your notes win when they disagree",
          "Every action item says whether it came from your notes, the transcript or both",
        ]}
      >
        Write the thing you would have scribbled on paper, and it ends up where it belongs: in the
        recap, as a task, and on the client&apos;s timeline.
      </Feature>
    </Section>
  );
}
