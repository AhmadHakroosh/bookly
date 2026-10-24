import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, Building2Icon, CheckIcon, MinusIcon, ServerIcon } from "lucide-react";
import { CAPTURE_OVERAGE_PER_HOUR, captureHours, PLANS, type Plan } from "@bookly/cloud";
import { Button } from "@/components/ui/button";
import { breadcrumbLd, faqLd, JsonLd } from "../json-ld";
import { PlanGrid } from "../plan-card";
import { pageMetadata, SITE } from "../site";
import { CtaBand, PageHero, Section, StraightAnswers } from "../_site/ui";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description: `Bookly plans: Free with contacts, briefings, the daily Home page and paid bookings at a ${PLANS.free.feePercent}% fee; Pro at $${PLANS.pro.priceMonthly}/month or $${PLANS.pro.priceYearly}/year adds Bookly video, auto-capture, no platform fee and a custom domain; Team at $${PLANS.team.priceMonthly} a member shares the customer memory. Enterprise and self-hosting below.`,
  path: "/pricing",
});

const plans = Object.values(PLANS);
const fmt = (n: number | null) => (n === null ? "Unlimited" : String(n));

const ROWS: [string, (p: Plan) => string | boolean][] = [
  ["Event types", ({ limits: l }) => fmt(l.eventTypes)],
  ["Members", ({ limits: l }) => fmt(l.members)],
  [
    "Connected accounts per member (Google, Microsoft, Zoom)",
    ({ limits: l }) => fmt(l.integrations),
  ],
  ["Bookings per month", ({ limits: l }) => fmt(l.bookingsPerMonth)],
  ["Custom domains", ({ limits: l }) => (l.domains ? String(l.domains) : false)],
  ["Google Meet, Teams or Zoom links, phone, in person", () => true],
  ["Bookly video (no account needed)", ({ limits: l }) => l.booklyVideo],
  ["Email confirmations and reminders", () => true],
  ["Contacts, timeline and the Home page", () => true],
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
    "Yes. Free gives you a booking page, two event types, one connected account (Google for Calendar and Meet, Microsoft for Outlook and Teams, or Zoom), email reminders and paid bookings through your own Stripe account (with a 5% platform fee), for as long as you like. No card needed. Pro lifts the one-account limit and adds Bookly video, the built-in room nobody needs an account for.",
  ],
  [
    "What counts as a member?",
    "A member is a person who signs in to your workspace and has their own calendar and booking pages. Team is billed per member with a minimum of two seats, and seats are added or credited as people join or leave. Every member sees the same contacts, timelines and briefings, so whoever takes the next call knows the whole history. Guests who book with you are never charged for.",
  ],
  [
    "What are transcription minutes?",
    "Auto-capture transcribes calls on Bookly video, Google Meet, Zoom and Teams; on the external providers a Bookly notetaker joins the call. Pro includes 5 meeting hours a month; Team includes 8 hours per member, pooled, so a team of four shares 32. Past that, transcription continues at $3 an hour, billed by the minute on your next invoice, or you can tell Bookly to stop at the included hours from the billing page.",
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
    "Yes. Bookly's core is open source under AGPL-3.0. Run it with Docker Compose and there are no plan limits; bring your own keys for email, video, payments and AI. Enterprise modules such as single sign-on need a license key.",
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
    <div>
      <JsonLd data={[breadcrumbLd([["Pricing", "/pricing"]]), faqLd(FAQ)]} />
      <PageHero
        first="Start free."
        second="Grow with your work."
        lead="Choose the plan that fits your stage. Upgrade any time as your client work grows, and cancel from the billing page. Prices in USD."
        note="All the essentials to get started."
      />

      <Section className="pt-6 md:pt-8" labelledBy="plans">
        <h2 id="plans" className="sr-only">
          Plans
        </h2>
        <PlanGrid plans={plans} heading="h3" />

        <div className="mt-6 grid gap-4 md:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center">
            <Building2Icon className="size-6 shrink-0 text-(--brand)" aria-hidden />
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold tracking-tight">Enterprise</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                For organisations: single sign-on and SCIM, custom roles, compliance reports and
                retention per region, on our cloud or your own servers, with a contract and an
                invoice. The first modules are in development; trial and development keys are free.
              </p>
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href="/contact" />}>
              Talk to us
            </Button>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <ServerIcon className="size-5 text-(--brand)" aria-hidden />
              <h3 className="font-bold tracking-tight">Self-hosted</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              The open-source core on your own server, free, with no plan limits.
            </p>
            <Link
              href="/docs/self-hosting"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Self-hosting guide
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </Section>

      <Section labelledBy="compare-plans" className="pt-4 md:pt-6">
        <h2 id="compare-plans" className="text-3xl font-bold tracking-[-0.03em]">
          Compare plans
        </h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-sidebar text-left">
                <th className="p-4 font-semibold">Feature</th>
                {plans.map((p) => (
                  <th key={p.id} className="w-32 p-4 text-center font-semibold">
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
      </Section>

      <StraightAnswers items={FAQ} />
      <CtaBand />
    </div>
  );
}
