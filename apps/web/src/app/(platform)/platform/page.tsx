import Link from "next/link";
import {
  ArrowRightIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CalendarRangeIcon,
  CodeIcon,
  CreditCardIcon,
  GlobeIcon,
  RepeatIcon,
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
  CallMock,
  ContactMock,
  InboxMock,
  RecapMock,
} from "./mocks";

const AUDIENCE = ["Consultants", "Coaches", "Agencies", "Freelancers", "Advisors", "Sales teams"];

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
    "Google Meet, Zoom, Teams, or built-in video that can transcribe the call.",
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
  [
    GlobeIcon,
    "Your domain",
    "book.yourname.com with automatic HTTPS, or a bookly.app subdomain in seconds.",
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
  "Resend",
];

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`py-16 md:py-24 ${className}`}>{children}</section>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <div className="-mt-12">
      {/* Hero */}
      <Section className="pb-8 md:pb-12">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="mb-5">
            Open source · self-host or let us host it
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            The meeting is booked. Bookly handles the rest.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground md:text-xl">
            Scheduling is the entry point. Bookly briefs you before the call, recaps it after, and
            turns every meeting into tasks, follow-ups and a relationship you can see.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
              Create your booking page
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/pricing" />}
            >
              See pricing
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Free plan, no card. Two minutes to your first booking page.
          </p>
        </div>
        <div className="mt-12">
          <InboxMock />
        </div>
        <ul className="mt-8 flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
          <li className="mr-1">Built for people who live off their meetings:</li>
          {AUDIENCE.map((a) => (
            <li key={a}>
              <Badge variant="secondary">{a}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      {/* Before / during / after */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Before, during, after</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Other tools stop when the slot is booked. That is where Bookly starts.
          </h2>
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          <div className="space-y-4">
            <BriefMock />
            <h3 className="text-lg font-semibold tracking-tight">Walk in prepared</h3>
            <p className="text-sm text-muted-foreground">
              An hour before every call you get a briefing: who they are, what happened last time,
              what they asked for when booking, what to prepare. Built from their timeline, not from
              your memory.
            </p>
          </div>
          <div className="space-y-4">
            <CallMock />
            <h3 className="text-lg font-semibold tracking-tight">Take the call, skip the notes</h3>
            <p className="text-sm text-muted-foreground">
              On built-in video the call is transcribed with consent and speaker labels. Both sides
              see the notice. You stay in the conversation instead of typing.
            </p>
          </div>
          <div className="space-y-4">
            <RecapMock compact />
            <h3 className="text-lg font-semibold tracking-tight">
              Act in a minute, not an afternoon
            </h3>
            <p className="text-sm text-muted-foreground">
              The recap has decisions and action items for both sides, each with the moment it came
              from. Create the tasks, move the stage, send the follow-up. One click each.
            </p>
          </div>
        </div>
      </Section>

      {/* Deep dives */}
      <Section className="border-t">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Recap with evidence</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              What was agreed, what they promised, what they pushed back on.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every item quotes the transcript so you trust it, and so disputes end before they
              start. Objections and open questions get their own list, because deals are lost on the
              concern nobody wrote down. A client-facing recap is one click away.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                "Did the call cover what they asked for when booking?",
                "Their commitments become tasks you can chase",
                "Follow-up and client recap drafted, you edit and send",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <ArrowRightIcon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <RecapMock />
        </div>
      </Section>

      <Section className="border-t">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <AvailabilityMock />
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow>Priority-aware availability</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Your calendar, governed by intent. Not just busy or free.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Mark afternoons as focus time and cap meetings per week. New leads see your open
              hours. Existing customers, the people who pay you, still get in. Bookly recognises
              them by email.
            </p>
          </div>
        </div>
      </Section>

      <Section className="border-t">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Contacts and timeline</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Every meeting has a relationship behind it.
            </h2>
            <p className="mt-4 text-muted-foreground">
              One record per person: stage, tags, notes, and a timeline of every booking, email,
              form answer and note. The inbox tells you who has gone quiet and when to follow up.
              Sync it to HubSpot or Pipedrive if that is where your team lives.
            </p>
          </div>
          <ContactMock />
        </div>
      </Section>

      <Section className="border-t">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <BookingPageMock />
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow>A booking page that does more</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Group sessions, recurring series, waitlists, routing.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Sell a six-week programme in one booking. Fill a workshop to its last seat and let the
              rest queue. Ask two questions and send each visitor to the right offer. All on a page
              at your own domain.
            </p>
          </div>
        </div>
      </Section>

      {/* Table stakes grid */}
      <Section className="border-t">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>And everything a booking page should do</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Nothing missing from the basics.
          </h2>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TABLE_STAKES.map(([Icon, t, d]) => (
            <li key={t} className="rounded-xl border p-5">
              <Icon className="size-5 text-muted-foreground" aria-hidden />
              <h3 className="mt-3 font-semibold tracking-tight">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-10 flex flex-wrap justify-center gap-2">
          {INTEGRATIONS.map((i) => (
            <li key={i}>
              <Badge variant="outline">{i}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      {/* Open source */}
      <Section className="border-t">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Open source</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Your clients&apos; conversations, on your terms.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Bookly is AGPL-licensed. Run it on your own server with Docker and keep every
              transcript and contact in your own database, or let us host it and get the same
              features with backups, updates and support. Transcripts expire on the schedule you
              set, attendees can delete theirs, and the AI parts are optional.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href="https://github.com/AhmadHakroosh/bookly"
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <CodeIcon data-icon="inline-start" />
                View on GitHub
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link href="/docs" />}>
                Read the docs
              </Button>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-xl border bg-muted p-5 text-xs leading-relaxed">
            {`git clone https://github.com/AhmadHakroosh/bookly.git && cd bookly
cp .env.example .env
docker compose --profile app up -d
# open http://localhost:3002 and create your workspace`}
          </pre>
        </div>
      </Section>

      {/* Pricing teaser */}
      <Section className="border-t">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Start free. Pay when it pays for itself.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border p-6 ${p.id === "pro" ? "border-foreground" : ""}`}
            >
              <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
              <p className="text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-4 text-3xl font-semibold">
                ${p.priceMonthly}
                <span className="text-sm font-normal text-muted-foreground">
                  {p.priceMonthly === 0 ? "" : p.id === "team" ? " / member / month" : " / month"}
                </span>
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                {p.highlights.slice(0, 4).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/pricing" className="underline underline-offset-4">
            Compare plans in detail
          </Link>
        </p>
      </Section>

      {/* Final CTA */}
      <Section className="border-t text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Your next meeting could arrive with a briefing.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Set up your booking page in two minutes. Connect your calendar. The rest starts working on
          the first call.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Get started free
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </Section>
    </div>
  );
}
