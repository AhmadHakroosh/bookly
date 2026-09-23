import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PLANS, isPlanId } from "@bookly/cloud";
import { SubmitButton } from "@/components/submit-button";
import { billingConfigured, planName, yearlyConfigured } from "@/server/billing";
import { usageSummary } from "@/server/limits";
import { isCloud } from "@/server/platform";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { manageBilling } from "./actions";
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
