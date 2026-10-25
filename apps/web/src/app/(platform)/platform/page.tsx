import type { Metadata } from "next";
import { BarChart3Icon, CalendarIcon, CircleCheckIcon, type LucideIcon } from "lucide-react";
import { PLANS } from "@bookly/cloud";
import { faqLd, JsonLd, organizationLd, softwareLd, websiteLd } from "./json-ld";
import { HOME_FAQ } from "./_site/faq";
import { JourneyDemo } from "./_site/journey-demo";
import { BriefingMini, CallNotesMini, JourneyTimelineMini } from "./_site/minis";
import { CtaBand, Eyebrow, Headline, StartFree, StraightAnswers } from "./_site/ui";
import { WorksWith } from "./_site/works-with";
import { pageMetadata, SITE } from "./site";

/*
 * Home, as `marketing ui 2.png` draws it: the split hero ("A booking starts it. Bookly keeps it
 * moving."), the client journey above an interactive contact workspace with sample data, the
 * tools it works with, "The call ends. The context stays." with three small pieces of the
 * product, then the questions people ask first and the Ink band. Depth lives on Product.
 */

export const metadata: Metadata = pageMetadata({ absoluteTitle: `${SITE.name} — ${SITE.tagline}` });

const CONTEXT: { icon: LucideIcon; title: string; body: string; mini: React.ReactNode }[] = [
  {
    icon: CalendarIcon,
    title: "Arrive prepared",
    body: "Everything you need, before the call: past conversations, notes, files and key details.",
    mini: <BriefingMini />,
  },
  {
    icon: CircleCheckIcon,
    title: "Leave with a plan",
    body: "Capture notes, decide on next steps and turn them into tasks, proposals or follow-ups.",
    mini: <CallNotesMini />,
  },
  {
    icon: BarChart3Icon,
    title: "Keep things moving",
    body: "Track follow-ups, proposals, invoices and payments, all connected to the client.",
    mini: <JourneyTimelineMini />,
  },
];

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

      <section aria-labelledby="home-title" className="px-4 pt-10 pb-8 md:pt-16">
        <div className="mx-auto grid max-w-6xl items-end gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
          <div className="min-w-0">
            <Eyebrow className="mb-4">Your client work, connected</Eyebrow>
            <Headline
              id="home-title"
              first="A booking starts it."
              second="Bookly keeps it moving."
              size="display"
            />
          </div>
          <div className="min-w-0 lg:pb-2">
            <p className="text-lg text-pretty text-muted-foreground md:text-xl">
              Meet prepared. Keep what matters. Turn conversations into follow-ups, proposals and
              paid work. Every client, in one place.
            </p>
            <StartFree className="mt-6" secondary={{ href: "#demo", label: "See it in action" }} />
          </div>
        </div>
      </section>

      <section id="demo" aria-labelledby="demo-caption" className="scroll-mt-20 px-4 pb-4">
        <div className="mx-auto max-w-6xl">
          <JourneyDemo />
          <p id="demo-caption" className="mt-4 text-center text-sm text-muted-foreground">
            One client. Every step connected. Interactive demo with sample data.
          </p>
        </div>
      </section>

      <WorksWith />

      <section aria-labelledby="context-title" className="px-4 py-14 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-end gap-4 md:grid-cols-[1.6fr_1fr] md:gap-12">
            <h2
              id="context-title"
              className="text-4xl leading-[1.02] font-bold tracking-[-0.035em] text-balance md:text-6xl"
            >
              The call ends. The context stays.
            </h2>
            <p className="text-pretty text-muted-foreground md:pb-2">
              Bookly helps you turn client conversations into clear next steps, with notes, tasks,
              files and follow-ups all in one place.
            </p>
          </div>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {CONTEXT.map(({ icon: Icon, title, body, mini }) => (
              <li key={title} className="flex flex-col rounded-2xl border bg-card p-5">
                <div className="flex items-start gap-4">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-(--brand)">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                  </div>
                </div>
                <div className="mt-5 flex-1 rounded-xl bg-muted/50 p-3">{mini}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <StraightAnswers items={HOME_FAQ} />
      <CtaBand />
    </div>
  );
}
