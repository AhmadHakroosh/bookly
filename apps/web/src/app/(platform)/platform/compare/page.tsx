import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { breadcrumbLd, JsonLd } from "../json-ld";
import { pageMetadata } from "../site";
import { CtaBand, PageHero, Section } from "../_site/ui";
import { COMPARISONS } from "./data";

export const metadata: Metadata = pageMetadata({
  title: "Compare",
  description:
    "Bookly next to Calendly, Cal.com and SavvyCal for scheduling, and Greenhouse, Ashby and Submittable for hiring and selection: dated, sourced facts, and where each one is ahead.",
  path: "/compare",
});

const GROUPS = [
  { key: "scheduling", title: "Scheduling and client work" },
  { key: "hiring", title: "Hiring and selection" },
] as const;

export default function ComparePage() {
  return (
    <div>
      <JsonLd data={breadcrumbLd([["Compare", "/compare"]])} />
      <PageHero
        first="Compare Bookly."
        second="Honestly."
        lead="Dated facts from each vendor's own pages, a link beside every claim, and where the other product is ahead today."
      />
      {GROUPS.map((g) => (
        <Section key={g.key} labelledBy={`group-${g.key}`} className="pt-6 md:pt-8">
          <h2
            id={`group-${g.key}`}
            className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
          >
            {g.title}
          </h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {COMPARISONS.filter((c) => c.group === g.key).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/compare/${c.slug}`}
                  className="group flex h-full flex-col rounded-2xl border bg-card p-6 transition-colors hover:border-(--brand)/40"
                >
                  <h3 className="text-lg font-bold tracking-tight">Bookly vs {c.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">{c.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    Read the comparison
                    <ArrowRightIcon
                      className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      <CtaBand />
    </div>
  );
}
