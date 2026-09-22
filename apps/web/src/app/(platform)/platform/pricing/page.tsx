import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, MinusIcon } from "lucide-react";
import { PLANS, type Limits } from "@bookly/cloud";
import { Button } from "@/components/ui/button";
import { breadcrumbLd, faqLd, JsonLd } from "../json-ld";
import { PlanGrid } from "../plan-card";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Bookly plans: Free with contacts, briefings and the Meeting Inbox; Pro at $12/month or $120/year adds auto-capture, paid bookings, a custom domain; Team at $10 a member, two months free yearly.",
  path: "/pricing",
});

const plans = Object.values(PLANS);
const fmt = (n: number | null) => (n === null ? "Unlimited" : String(n));

const ROWS: [string, (l: Limits) => string | boolean][] = [
  ["Event types", (l) => fmt(l.eventTypes)],
  ["Members", (l) => fmt(l.members)],
  ["Connected calendars / conferencing per member", (l) => fmt(l.integrations)],
  ["Bookings per month", (l) => fmt(l.bookingsPerMonth)],
  ["Custom domains", (l) => (l.domains ? String(l.domains) : false)],
  ["Google Meet, Zoom, Teams, built-in video", () => true],
  ["Email confirmations and reminders", () => true],
  ["Contacts, timeline and Meeting Inbox", () => true],
  ["Pre-meeting briefings", () => true],
  ["Group sessions, series, waitlists, routing", () => true],
  ["Paid bookings via Stripe", (l) => l.payments],
  ["Custom reminders, SMS and WhatsApp", (l) => l.workflows],
  ["Round-robin and collective events", (l) => l.teamScheduling],
  [
    "Auto-capture transcription minutes / month",
    (l) => (l.captureMinutesPerMonth ? fmt(l.captureMinutesPerMonth) : false),
  ],
  ["AI recap, tasks and follow-up drafts", (l) => (l.captureMinutesPerMonth ? true : false)],
  ["HubSpot / Pipedrive sync", (l) => l.api],
  ["API and webhooks", (l) => l.api],
  ["API requests per minute", (l) => fmt(l.apiRequestsPerMinute)],
  ["Your logo and colour, no Bookly branding", (l) => l.removeBranding],
];

const FAQ: [string, string][] = [
  [
    "Is there a free plan?",
    "Yes. Free gives you a booking page, two event types, one connected calendar, built-in video and email reminders, for as long as you like. No card needed.",
  ],
  [
    "What counts as a member?",
    "A member is a person who signs in to your workspace and has their own calendar and booking pages. Guests who book with you are never charged for.",
  ],
  [
    "What are transcription minutes?",
    "Auto-capture transcribes calls on built-in video. Each plan includes a monthly budget of transcribed minutes. When it runs out, calls still happen; they just are not transcribed until the next month or an upgrade.",
  ],
  [
    "Monthly or yearly?",
    "Both. Yearly is charged up front and works out to two months free ($120 a year for Pro, $100 a member for Team). Yearly plans renew each year; cancelling stops the renewal and the plan stays active until the year ends. Partial years are not refunded unless the law requires it.",
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
                      <Cell v={get(p.limits)} />
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
