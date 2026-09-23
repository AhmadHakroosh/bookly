import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, MinusIcon } from "lucide-react";
import { CAPTURE_OVERAGE_PER_HOUR, captureHours, PLANS, type Plan } from "@bookly/cloud";
import { Button } from "@/components/ui/button";
import { breadcrumbLd, faqLd, JsonLd } from "../json-ld";
import { PlanGrid } from "../plan-card";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Bookly plans: Free with contacts, briefings, the Meeting Inbox and paid bookings at a 5% fee; Pro at $24/month or $240/year adds Bookly video, auto-capture, paid bookings with no platform fee, a custom domain; Team at $30 a member shares the customer memory, two months free yearly.",
  path: "/pricing",
});

const plans = Object.values(PLANS);
const fmt = (n: number | null) => (n === null ? "Unlimited" : String(n));

const ROWS: [string, (p: Plan) => string | boolean][] = [
  ["Event types", ({ limits: l }) => fmt(l.eventTypes)],
  ["Members", ({ limits: l }) => fmt(l.members)],
  ["Connected calendars / conferencing per member", ({ limits: l }) => fmt(l.integrations)],
  ["Bookings per month", ({ limits: l }) => fmt(l.bookingsPerMonth)],
  ["Custom domains", ({ limits: l }) => (l.domains ? String(l.domains) : false)],
  ["Google Meet, Zoom, Teams, phone, in person", () => true],
  ["Bookly video (no account needed)", ({ limits: l }) => l.booklyVideo],
  ["Email confirmations and reminders", () => true],
  ["Contacts, timeline and Meeting Inbox", () => true],
  [
    "Customer memory",
    ({ limits: l }) => (l.members !== null && l.members > 1 ? "Shared across the team" : "Yours"),
  ],
  ["Pre-meeting briefings", () => true],
  ["Group sessions, series, waitlists, routing", () => true],
  ["Paid bookings via Stripe", ({ limits: l }) => l.payments],
  [
    "Platform fee on paid bookings",
    (p) => (p.limits.payments ? (p.feePercent ? `${p.feePercent}%` : "None") : false),
  ],
  ["Custom reminders, SMS and WhatsApp", ({ limits: l }) => l.workflows],
  ["Round-robin and collective events", ({ limits: l }) => l.teamScheduling],
  [
    "Auto-capture: meeting hours included / month",
    ({ limits: l }) =>
      l.captureMinutesPerMonth
        ? `${captureHours(l.captureMinutesPerMonth)}${l.captureMinutesPerMember ? " per member, pooled" : ""}`
        : false,
  ],
  [
    "Extra meeting hours",
    ({ limits: l }) => (l.captureMinutesPerMonth ? `$${CAPTURE_OVERAGE_PER_HOUR} an hour` : false),
  ],
  [
    "AI recap, tasks and follow-up drafts",
    ({ limits: l }) => (l.captureMinutesPerMonth ? true : false),
  ],
  ["HubSpot / Pipedrive sync", ({ limits: l }) => l.api],
  ["API and webhooks", ({ limits: l }) => l.api],
  ["API requests per minute", ({ limits: l }) => fmt(l.apiRequestsPerMinute)],
  ["Your logo and colour, no Bookly branding", ({ limits: l }) => l.removeBranding],
];

const FAQ: [string, string][] = [
  [
    "Is there a free plan?",
    "Yes. Free gives you a booking page, two event types, one connected calendar, Google Meet, Zoom or Teams links, email reminders and paid bookings through your own Stripe account (with a 5% platform fee), for as long as you like. No card needed. Bookly video, the built-in room nobody needs an account for, starts on Pro.",
  ],
  [
    "What counts as a member?",
    "A member is a person who signs in to your workspace and has their own calendar and booking pages. Team is billed per member with a minimum of two seats, and seats are added or credited as people join or leave. Every member sees the same contacts, timelines and briefings, so whoever takes the next call knows the whole history. Guests who book with you are never charged for.",
  ],
  [
    "What are transcription minutes?",
    "Auto-capture transcribes calls on Bookly video, Google Meet, Zoom and Teams; on the external providers a Bookly notetaker joins the call. Pro includes 5 meeting hours a month; Team includes 5 hours per member, pooled, so a team of four shares 20. Past that, transcription continues at $3 an hour, billed by the minute on your next invoice, or you can tell Bookly to stop at the included hours from the billing page.",
  ],
  [
    "Monthly or yearly?",
    "Both. Yearly is charged up front and works out to two months free ($240 a year for Pro, $300 a member for Team, so $20 and $25 a month). Yearly plans renew each year; cancelling stops the renewal and the plan stays active until the year ends. Partial years are not refunded unless the law requires it.",
  ],
  [
    "What does a paid booking cost me?",
    "Guests pay into your own Stripe account, which you connect from Settings. On Pro and Team you keep everything except Stripe's processing fee: Bookly takes no platform fee. On Free, Bookly keeps 5% of each payment, taken automatically before Stripe pays you out, and refunds return it. Self-hosted installs pay no fee either.",
  ],
  [
    "Can I self-host instead?",
    "Yes. Bookly is open source under AGPL-3.0. Run it with Docker Compose and every feature is unlocked with no limits. Bring your own keys for email, video, payments and AI.",
  ],
  [
    "Can I cancel or change plans?",
    "Any time, from the billing page in your workspace. Downgrades take effect at the end of the billing period; upgrades apply immediately.",
  ],
  [
    "Do you offer discounts for non-profits or education?",
    `Yes. Write to ${SITE.supportEmail} from your organisation's address and we will set it up.`,
  ],
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true)
    return <CheckIcon className="mx-auto size-4 text-(--brand)" aria-label="Included" />;
  if (v === false)
    return (
      <MinusIcon className="mx-auto size-4 text-muted-foreground/50" aria-label="Not included" />
    );
  return <span>{v}</span>;
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
      <JsonLd data={[breadcrumbLd([["Pricing", "/pricing"]]), faqLd(FAQ)]} />
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
          Start free. Pay when it pays for itself.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Upgrade from your workspace whenever you hit a limit. Cancel any time from the billing
          page. Prices in USD.
        </p>
      </div>

      <div className="mt-12">
        <PlanGrid plans={plans} heading="h2" />
      </div>

      <div className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">Compare plans</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-4 font-medium">Feature</th>
                {plans.map((p) => (
                  <th key={p.id} className="w-32 p-4 text-center font-medium">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, get]) => (
                <tr key={label} className="border-b last:border-0">
                  <td className="p-4">{label}</td>
                  {plans.map((p) => (
                    <td key={p.id} className="p-4 text-center">
                      <Cell v={get(p)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-20 grid gap-10 md:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Anything else?{" "}
            <Link href="/contact" className="underline underline-offset-4">
              Get in touch
            </Link>
            .
          </p>
        </div>
        <dl className="divide-y">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-4">
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-20 rounded-2xl border bg-muted/30 p-8 text-center">
        <h2 className="text-xl font-semibold tracking-tight">Prefer to run it yourself?</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Bookly is open source and self-hostable with every feature unlocked and no limits. You
          bring the server and the API keys; we bring the updates.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/docs/self-hosting" target="_blank" />}
          >
            Self-hosting guide
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<a href={SITE.github} target="_blank" rel="noreferrer" />}
          >
            GitHub
          </Button>
        </div>
      </div>
    </div>
  );
}
