import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CAPTURE_OVERAGE_PER_MINUTE, PLANS, isPlanId } from "@bookly/cloud";
import { SubmitButton } from "@/components/submit-button";
import { billingConfigured, overageConfigured, planName, yearlyConfigured } from "@/server/billing";
import { overageAllowed, usageSummary, workspaceLimits } from "@/server/limits";
import { isCloud } from "@/server/platform";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { manageBilling, toggleCaptureOverage } from "./actions";
import { UpgradeCards } from "./upgrade-cards";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Billing" };

async function BillingPage({ searchParams }: PageProps<"/admin/billing">) {
  if (!isCloud()) notFound();
  const [{ role }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  const usage = await usageSummary(ws);
  const canManage = role === "owner" || role === "admin";
  const current = isPlanId(ws.plan) ? ws.plan : "free";
  const capture = usage.find((u) => u.key === "captureMinutesPerMonth");
  const overMinutes = capture && capture.max !== null ? Math.max(0, capture.used - capture.max) : 0;
  const overageOffer =
    overageConfigured() &&
    !!workspaceLimits(ws).captureMinutesPerMonth &&
    !!ws.stripeSubscriptionId;
  const overageOn = overageAllowed(ws);
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          You are on the <strong>{planName(ws.plan)}</strong> plan
          {ws.planStatus && ws.planStatus !== "active"
            ? ` (${ws.planStatus.replace("_", " ")})`
            : ""}
          {ws.settings.billingInterval === "year" ? ", billed yearly" : ""}
          {ws.planRenewsAt ? ` · renews ${ws.planRenewsAt.toLocaleDateString()}` : ""}.
        </p>
        {sp.upgraded === "1" && (
          <p className="mt-2 rounded-md border p-3 text-sm">
            Thanks! Your plan updates as soon as Stripe confirms the payment.
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">Usage</h2>
        <ul className="divide-y rounded-xl border text-sm">
          {usage.map((u) => (
            <li key={u.key} className="flex items-center justify-between p-3">
              <span className="capitalize">{u.label}</span>
              <span
                className={
                  u.max !== null && u.used >= u.max ? "text-destructive" : "text-muted-foreground"
                }
              >
                {u.used} / {u.max === null ? "unlimited" : u.max}
              </span>
            </li>
          ))}
        </ul>
        {overageOffer && (
          <div className="rounded-xl border p-3 text-sm">
            <form action={toggleCaptureOverage.bind(null, !overageOn)}>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="overage"
                  checked={overageOn}
                  readOnly
                  className="mt-1"
                />
                <span>
                  Keep transcribing past the included minutes at $
                  {CAPTURE_OVERAGE_PER_MINUTE.toFixed(2)} a minute, on your next invoice.
                  <span className="block text-xs text-muted-foreground">
                    {overageOn
                      ? overMinutes > 0
                        ? `${overMinutes} extra minutes so far this month, about $${(overMinutes * CAPTURE_OVERAGE_PER_MINUTE).toFixed(2)}.`
                        : "Nothing extra so far this month."
                      : "Off: transcription stops for the month once the included minutes are used up."}
                  </span>
                </span>
              </label>
              {canManage && (
                <SubmitButton variant="outline" size="sm" className="mt-2">
                  {overageOn ? "Stop at the included minutes" : "Turn on"}
                </SubmitButton>
              )}
            </form>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Plans</h2>
        <UpgradeCards
          plans={Object.values(PLANS)}
          current={current}
          canManage={canManage}
          billing={billingConfigured()}
          yearly={yearlyConfigured()}
        />
        {!billingConfigured() && (
          <p className="text-xs text-muted-foreground">
            Upgrades are not enabled on this platform yet.
          </p>
        )}
      </section>

      {canManage && ws.stripeCustomerId && (
        <form action={manageBilling}>
          <SubmitButton variant="outline">
            Manage payment method, invoices and cancellation
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export default function BillingPageBoundary(props: PageProps<"/admin/billing">) {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl">
          <PageSkeleton />
        </div>
      }
    >
      <BillingPage {...props} />
    </Suspense>
  );
}
