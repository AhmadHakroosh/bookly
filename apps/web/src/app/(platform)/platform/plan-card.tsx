"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon, SparklesIcon } from "lucide-react";
import {
  monthlyEquivalent,
  monthsFreeYearly,
  planPrice,
  type BillingInterval,
  type Plan,
} from "@bookly/cloud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Monthly / yearly switch shared by the plan grids and Admin → Billing. */
export function IntervalToggle({
  value,
  onChange,
  monthsFree = 2,
  className = "",
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
  monthsFree?: number;
  className?: string;
}) {
  const opt = (v: BillingInterval, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={`rounded-full px-4 py-1.5 text-sm transition-colors ${value === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className={`inline-flex items-center gap-1 rounded-full border p-1 ${className}`}
    >
      {opt("month", "Monthly")}
      {opt("year", `Yearly · ${monthsFree} months free`)}
    </div>
  );
}

/** The price line for a plan at a billing period; "$10 / month, billed $120 yearly". */
export function PriceLine({ plan: p, interval }: { plan: Plan; interval: BillingInterval }) {
  const unit = p.id === "team" ? " / member / month" : " / month";
  if (p.priceMonthly === 0)
    return (
      <p className="mt-4 text-3xl font-semibold">
        $0<span className="text-sm font-normal text-muted-foreground"> forever</span>
      </p>
    );
  return (
    <p className="mt-4">
      <span className="text-3xl font-semibold">${monthlyEquivalent(p, interval)}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
      <span className="block text-xs text-muted-foreground">
        {interval === "year"
          ? `billed $${planPrice(p, "year")}${p.id === "team" ? " per member" : ""} a year`
          : "billed monthly"}
      </span>
    </p>
  );
}

/** One plan, the same on the landing page and the pricing page: featured highlights stand out. */
export function PlanCard({
  plan: p,
  interval = "month",
  className = "",
  heading: H = "h3",
}: {
  plan: Plan;
  interval?: BillingInterval;
  className?: string;
  /** h2 on the pricing page (under its h1), h3 on the landing page (under a section h2). */
  heading?: "h2" | "h3";
}) {
  const pro = p.id === "pro";
  return (
    <div
      className={`flex flex-col rounded-2xl border bg-background p-6 ${pro ? "border-(--brand) ring-1 ring-(--brand)" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <H className="text-lg font-semibold tracking-tight">{p.name}</H>
        {pro && <Badge>Most popular</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{p.tagline}</p>
      <PriceLine plan={p} interval={interval} />
      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {p.highlights.map((h) => {
          const strong = p.featured.includes(h);
          return (
            <li
              key={h}
              className={`flex gap-2 ${strong ? "font-medium" : "text-muted-foreground"}`}
            >
              {strong ? (
                <SparklesIcon className="mt-0.5 size-4 shrink-0 text-(--brand)" aria-hidden />
              ) : (
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-(--brand)/70" aria-hidden />
              )}
              <span className={strong ? "text-foreground" : ""}>{h}</span>
            </li>
          );
        })}
      </ul>
      <Button
        className="mt-6"
        variant={pro ? "default" : "outline"}
        nativeButton={false}
        render={
          <Link
            href={p.priceMonthly === 0 ? "/signup" : `/signup?plan=${p.id}&interval=${interval}`}
          />
        }
      >
        {p.priceMonthly === 0 ? "Start free" : `Start with ${p.name}`}
      </Button>
    </div>
  );
}

/**
 * The three plans with the billing switch above them. Yearly is the default: it is the better
 * deal and what most people pick once they see it.
 */
export function PlanGrid({
  plans,
  heading,
  reveal = false,
}: {
  plans: Plan[];
  heading?: "h2" | "h3";
  /** Landing page: stagger the cards' scroll-reveal. */
  reveal?: boolean;
}) {
  const [interval, setInterval] = useState<BillingInterval>("year");
  const monthsFree = Math.max(...plans.map(monthsFreeYearly));
  return (
    <>
      <div className="flex justify-center">
        <IntervalToggle value={interval} onChange={setInterval} monthsFree={monthsFree} />
      </div>
      <div className={`mt-8 grid gap-6 md:grid-cols-3 ${reveal ? "gap-4" : ""}`}>
        {plans.map((p, i) =>
          reveal ? (
            <div key={p.id} data-reveal style={{ "--reveal-delay": `${i * 100}ms` } as never}>
              <PlanCard plan={p} interval={interval} className="h-full" heading={heading} />
            </div>
          ) : (
            <PlanCard key={p.id} plan={p} interval={interval} heading={heading} />
          ),
        )}
      </div>
    </>
  );
}
