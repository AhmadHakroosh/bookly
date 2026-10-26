import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CalendarIcon,
  CodeXmlIcon,
  CreditCardIcon,
  GitCompareArrowsIcon,
  HistoryIcon,
  PaletteIcon,
  PlugIcon,
  ServerIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { docsSearchIndex } from "@/server/docs";
import { recentReleases } from "@/server/release";
import { breadcrumbLd, JsonLd } from "../json-ld";
import { pageMetadata } from "../site";
import { CtaBand, PageHero, Section } from "../_site/ui";
import { DocsSearch } from "./docs-search";

export const metadata: Metadata = pageMetadata({
  title: "Resources",
  description:
    "Make Bookly your own: search the documentation, get started, set up scheduling, payments, integrations and teams, self-host it, use the API and follow the changelog.",
  path: "/resources",
});

/** The docs index and the latest releases, read from the repository once per build. */
async function data() {
  "use cache";
  cacheLife("max");
  const [entries, releases] = await Promise.all([docsSearchIndex(), recentReleases(3)]);
  return { entries, releases };
}

const CARDS: { icon: LucideIcon; title: string; body: string; href: string }[] = [
  {
    icon: BookOpenIcon,
    title: "Getting started",
    body: "Set up your account and take your first booking.",
    href: "/docs",
  },
  {
    icon: CalendarIcon,
    title: "Scheduling",
    body: "Configure availability, event types and booking pages.",
    href: "/docs/scheduling",
  },
  {
    icon: CreditCardIcon,
    title: "Payments",
    body: "Connect Stripe, price event types and send payment requests.",
    href: "/docs/payments",
  },
  {
    icon: PlugIcon,
    title: "Integrations",
    body: "Link your calendars, video tools and CRM.",
    href: "/docs/integrations",
  },
  {
    icon: UsersIcon,
    title: "Teams",
    body: "Work together with clients across your team.",
    href: "/docs/teams",
  },
  {
    icon: ServerIcon,
    title: "Self-hosting",
    body: "Run Bookly on your own infrastructure with Docker Compose.",
    href: "/docs/self-hosting",
  },
];

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export default async function ResourcesPage() {
  const { entries, releases } = await data();
  return (
    <div>
      <JsonLd data={breadcrumbLd([["Resources", "/resources"]])} />
      <PageHero
        first="Make Bookly"
        second="your own."
        lead="Guides, documentation and tools to help you get the most out of Bookly."
        aside={
          <div className="lg:pb-16">
            <DocsSearch entries={entries} />
          </div>
        }
      />

      <Section className="pt-6 md:pt-8" labelledBy="guides">
        <h2 id="guides" className="sr-only">
          Guides
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <li key={c.title}>
              <ResourceCard {...c} />
            </li>
          ))}
          <li className="sm:col-span-2 lg:col-span-1">
            <ResourceCard
              icon={CodeXmlIcon}
              title="API reference"
              body="Explore the REST API and webhooks, and build with Bookly."
              href="/docs/api"
            />
          </li>
          <li className="sm:col-span-2">
            <div className="flex h-full flex-col rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-3 font-bold tracking-tight">
                  <HistoryIcon className="size-5 text-(--brand)" aria-hidden />
                  Changelog
                </h3>
                <Link
                  href="/changelog"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  View all
                  <ArrowRightIcon className="size-4" aria-hidden />
                </Link>
              </div>
              <ul className="mt-4 space-y-2.5 text-sm">
                {releases.map((r) => (
                  <li key={r.version} className="flex items-baseline gap-3">
                    <span
                      className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-(--brand)"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{r.version}</span>{" "}
                      <span className="text-muted-foreground">{r.headline}</span>
                    </span>
                    <time dateTime={r.date} className="shrink-0 text-xs text-muted-foreground">
                      {fmtDate(r.date)}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        </ul>
      </Section>

      <Section labelledBy="more-title" className="pt-0 md:pt-0">
        <h2 id="more-title" className="text-xl font-bold tracking-tight">
          More to read
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          <li>
            <ResourceCard
              icon={GitCompareArrowsIcon}
              title="Compare Bookly"
              body="Next to Calendly, Cal.com, SavvyCal, Greenhouse, Ashby and Submittable."
              href="/compare"
            />
          </li>
          <li>
            <ResourceCard
              icon={PaletteIcon}
              title="Brand and press"
              body="Logos, colors and the press kit."
              href="/press"
            />
          </li>
          <li>
            <ResourceCard
              icon={ArrowUpRightIcon}
              title="All documentation"
              body="Every guide, from routing forms to custom domains."
              href="/docs"
            />
          </li>
        </ul>
      </Section>
      <CtaBand />
    </div>
  );
}

function ResourceCard({
  icon: Icon,
  title,
  body,
  href,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-2xl border bg-card p-6 transition-colors hover:border-(--brand)/40"
    >
      <Icon className="size-6 text-(--brand)" aria-hidden />
      <h3 className="mt-4 font-bold tracking-tight">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{body}</p>
      <ArrowRightIcon
        className="mt-4 size-4 self-end text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  );
}
