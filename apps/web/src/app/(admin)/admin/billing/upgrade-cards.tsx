"use client";

import { useState } from "react";
import { monthsFreeYearly, type BillingInterval, type Plan, type PlanId } from "@bookly/cloud";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { IntervalToggle, PriceLine } from "@/app/(platform)/platform/plan-card";
import { upgrade } from "./actions";

/** The plan cards on Admin → Billing, with the billing switch when yearly prices exist. */
export function UpgradeCards({
  plans,
  current,
  canManage,
  billing,
  yearly,
}: {
  plans: Plan[];
  current: PlanId;
  canManage: boolean;
  /** Upgrades are possible (Stripe prices configured). */
  billing: boolean;
  /** Yearly prices configured too. */
  yearly: boolean;
}) {
  const [interval, setInterval] = useState<BillingInterval>(yearly ? "year" : "month");
  return (
    <div className="space-y-4">
      {yearly && (
        <IntervalToggle
          value={interval}
          onChange={setInterval}
          monthsFree={Math.max(...plans.map(monthsFreeYearly))}
        />
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="flex flex-col rounded-xl border p-4">
            <p className="font-medium">
              {p.name} {p.id === current && <Badge>Current</Badge>}
            </p>
            <PriceLine plan={p} interval={interval} />
            <ul className="mt-3 flex-1 space-y-1 text-xs text-muted-foreground">
              {p.highlights.map((h) => (
                <li key={h}>· {h}</li>
              ))}
            </ul>
            {canManage && p.id !== current && p.id !== "free" && billing && (
              <form action={upgrade.bind(null, p.id, interval)} className="mt-4">
                <SubmitButton className="w-full">
                  {current === "free" ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                </SubmitButton>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
