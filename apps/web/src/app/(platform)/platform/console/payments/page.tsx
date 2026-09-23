import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "@/components/links";
import { SubmitButton } from "@/components/submit-button";
import { PageSkeleton } from "@/components/page-skeleton";
import { billingConfigured, planName } from "@/server/billing";
import { effectivePlan, PLANS, type PlanId } from "@bookly/cloud";
import { listConnectedWorkspaces, planFeeOverrides, planFees } from "@/server/connect";
import { paymentsConfigured } from "@/server/payments";
import { disconnectWorkspaceStripe, setPlatformFees } from "../actions";
import { NumberField } from "@/components/number-field";

export const metadata = { title: "Payments", robots: { index: false } };

const STRIPE = "https://dashboard.stripe.com";

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 p-3">
      <span
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-destructive"}`}
        aria-label={ok ? "OK" : "Attention"}
      />
      <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-3">
        <span className="block font-medium sm:w-56 sm:shrink-0">{label}</span>
        <span className="block break-words text-muted-foreground">{detail}</span>
      </div>
    </li>
  );
}

async function PaymentsPage() {
  await connection();
  const env = loadEnv();
  const [fees, rates, rows] = await Promise.all([
    planFeeOverrides(),
    planFees(),
    listConnectedWorkspaces(),
  ]);
  const ready = rows.filter((w) => w.settings.payments?.chargesEnabled).length;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Payments</h2>
        <p className="text-sm text-muted-foreground">
          Two money flows, two Stripe roles. Workspaces pay the platform for their plan through the
          platform account. Guests pay hosts for bookings through each host&apos;s own connected
          Stripe account; the platform keeps the fee below. Keys stay in the environment; this page
          shows what they enable.
        </p>
      </div>

      <ul className="divide-y rounded-xl border text-sm">
        <Check
          ok={paymentsConfigured()}
          label="Platform Stripe account"
          detail={
            paymentsConfigured()
              ? `Secret key set; ${env.STRIPE_WEBHOOK_SECRET ? "platform webhook set" : "platform webhook secret missing (STRIPE_WEBHOOK_SECRET)"}`
              : "STRIPE_SECRET_KEY missing: no subscriptions, no paid bookings"
          }
        />
        <Check
          ok={billingConfigured()}
          label="Plan subscriptions"
          detail={
            billingConfigured()
              ? "Pro and Team price ids set; upgrades open Stripe Checkout"
              : "STRIPE_PRICE_PRO / STRIPE_PRICE_TEAM missing: upgrades are hidden"
          }
        />
        <Check
          ok={!!env.STRIPE_CONNECT_WEBHOOK_SECRET}
          label="Connect webhook"
          detail={
            env.STRIPE_CONNECT_WEBHOOK_SECRET
              ? "Events from hosts' accounts are verified at /api/webhooks/stripe/connect"
              : "STRIPE_CONNECT_WEBHOOK_SECRET missing: hosts' payments cannot confirm bookings"
          }
        />
        <Check
          ok
          label="Connected hosts"
          detail={`${rows.length} connected, ${ready} ready to charge`}
        />
      </ul>

      <section className="rounded-xl border p-4">
        <h3 className="text-base font-semibold tracking-tight">Platform fee</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Kept from every booking payment and payment request on a connected account, on top of
          Stripe&apos;s processing fee. Refunds return it. One rate per plan; blank means the
          built-in rate (
          {Object.values(PLANS)
            .map((p) => `${p.name} ${p.feePercent}%`)
            .join(", ")}
          ). A lapsed paid plan pays Free&apos;s rate. Override a single workspace on its page.
        </p>
        <form action={setPlatformFees} className="mt-3 flex flex-wrap items-end gap-3">
          {(Object.keys(PLANS) as PlanId[]).map((id) => (
            <label key={id} className="space-y-1 text-sm">
              <span className="block">{PLANS[id].name}</span>
              <NumberField
                name={`fee_${id}`}
                min={0}
                max={50}
                step={0.5}
                decimals={1}
                defaultValue={fees[id]}
                placeholder={String(PLANS[id].feePercent)}
                ariaLabel={`${PLANS[id].name} fee percent`}
                unit="%"
                className="w-40"
              />
            </label>
          ))}
          <SubmitButton variant="outline">Save</SubmitButton>
        </form>
      </section>

      <section className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Workspace</th>
              <th className="p-3 font-medium">Plan</th>
              <th className="p-3 font-medium">Stripe account</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Fee</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const p = w.settings.payments;
              return (
                <tr key={w.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Link href={`/console/${w.id}`} className="hover:underline">
                      {w.name}
                    </Link>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{w.slug}</span>
                  </td>
                  <td className="p-3">{planName(w.plan)}</td>
                  <td className="p-3 font-mono text-xs whitespace-nowrap">
                    <ExternalLink href={`${STRIPE}/connect/accounts/${w.stripeAccountId}`}>
                      {w.stripeAccountId}
                    </ExternalLink>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {p?.chargesEnabled ? (
                      <Badge>Ready</Badge>
                    ) : p?.detailsSubmitted ? (
                      <Badge variant="secondary">Under review</Badge>
                    ) : (
                      <Badge variant="outline">Onboarding</Badge>
                    )}
                    {p?.chargesEnabled && !p.payoutsEnabled && (
                      <Badge variant="outline" className="ml-1">
                        Payouts pending
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {typeof p?.feePercent === "number"
                      ? `${p.feePercent}% (override)`
                      : `${rates[effectivePlan(w.plan, w.planStatus)?.id ?? "free"]}%`}
                  </td>
                  <td className="p-3 text-right">
                    <form action={disconnectWorkspaceStripe.bind(null, w.id)}>
                      <SubmitButton variant="ghost" className="text-destructive">
                        Disconnect
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No host has connected Stripe yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function PaymentsPageBoundary() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PaymentsPage />
    </Suspense>
  );
}
