import Link from "next/link";
import { PLANS } from "@bookly/cloud";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <div className="space-y-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Simple pricing</h1>
        <p className="mt-2 text-muted-foreground">
          Start free. Upgrade from your workspace whenever you hit a limit. Cancel any time from the
          billing page.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {Object.values(PLANS).map((p) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-2xl border p-6 ${p.id === "pro" ? "border-foreground" : ""}`}
          >
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="text-sm text-muted-foreground">{p.tagline}</p>
            <p className="mt-4 text-3xl font-semibold">
              ${p.priceMonthly}
              <span className="text-sm font-normal text-muted-foreground">
                {p.priceMonthly === 0 ? "" : p.id === "team" ? " / member / month" : " / month"}
              </span>
            </p>
            <ul className="mt-6 flex-1 space-y-2 text-sm">
              {p.highlights.map((h) => (
                <li key={h}>· {h}</li>
              ))}
            </ul>
            <Button
              className="mt-6"
              variant={p.id === "pro" ? "default" : "outline"}
              nativeButton={false}
              render={<Link href="/signup" />}
            >
              {p.priceMonthly === 0 ? "Start free" : `Start with ${p.name}`}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Prefer to run it yourself? Bookly is open source and self-hostable with every feature
        unlocked.
      </p>
    </div>
  );
}
