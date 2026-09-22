import Link from "next/link";
import { CheckIcon, SparklesIcon } from "lucide-react";
import type { Plan } from "@bookly/cloud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** One plan, the same on the landing page and the pricing page: featured highlights stand out. */
export function PlanCard({ plan: p, className = "" }: { plan: Plan; className?: string }) {
  const pro = p.id === "pro";
  return (
    <div
      className={`flex flex-col rounded-2xl border bg-background p-6 ${pro ? "border-(--brand) ring-1 ring-(--brand)" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
        {pro && <Badge>Most popular</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{p.tagline}</p>
      <p className="mt-4 text-3xl font-semibold">
        ${p.priceMonthly}
        <span className="text-sm font-normal text-muted-foreground">
          {p.priceMonthly === 0 ? " forever" : p.id === "team" ? " / member / month" : " / month"}
        </span>
      </p>
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
        render={<Link href={`/signup?plan=${p.id}`} />}
      >
        {p.priceMonthly === 0 ? "Start free" : `Start with ${p.name}`}
      </Button>
    </div>
  );
}
