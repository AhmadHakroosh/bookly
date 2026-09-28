import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isInterval, isPlanId, PLANS } from "@bookly/cloud";
import { Card, Heading, Shell } from "@/components/skeletons/primitives";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate } from "@/lib/time";
import { previewPlanChange, yearlyConfigured } from "@/server/billing";
import { formatPrice } from "@/server/payments";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { confirmPlanChange, manageBilling } from "../actions";

export const metadata = { title: "Confirm plan change" };

/**
 * The step between picking a plan and paying for it when a subscription already exists: what
 * Stripe will charge now (prorated for the rest of the period), what the plan costs from
 * then on, and the card it goes on. Nothing changes until the customer confirms.
 */
async function ChangePage({ searchParams }: PageProps<"/admin/billing/change">) {
  const [{ role }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  if (role !== "owner" && role !== "admin") redirect("/admin/billing");
  const plan = typeof sp.plan === "string" && isPlanId(sp.plan) ? sp.plan : null;
  const interval =
    typeof sp.interval === "string" && isInterval(sp.interval) && yearlyConfigured()
      ? sp.interval
      : "month";
  if (!plan || plan === "free") redirect("/admin/billing");
  const preview = await previewPlanChange(ws, plan, interval);
  if (!preview) redirect("/admin/billing");
  const per = interval === "year" ? "year" : "month";
  const seats = plan === "team" ? ` for ${preview.quantity} seats` : "";
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Switch to {PLANS[plan].name}, billed {interval === "year" ? "yearly" : "monthly"}
        </h1>
        <p className="text-sm text-muted-foreground">Review the charge before anything changes.</p>
      </div>
      <dl className="space-y-3 rounded-xl border p-5 text-sm">
        <div className="flex gap-4">
          <dt className="w-32 shrink-0 text-muted-foreground">Charged now</dt>
          <dd>
            {preview.dueNow > 0 ? (
              <>
                <strong>{formatPrice(preview.dueNow, preview.currency)}</strong>
                {preview.from ? ", prorated for the rest of the current period" : ""}
              </>
            ) : preview.credit > 0 ? (
              <>
                Nothing. The unused part of what you already paid,{" "}
                {formatPrice(preview.credit, preview.currency)}, becomes a credit on your next
                invoices.
              </>
            ) : (
              "Nothing"
            )}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-32 shrink-0 text-muted-foreground">Then</dt>
          <dd>
            {formatPrice(preview.recurring, preview.currency)} per {per}
            {seats}
            {preview.from
              ? `, from ${fmtDate(preview.from, ws.timezone)}`
              : ", starting today (the billing cycle restarts with the new interval)"}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-32 shrink-0 text-muted-foreground">Paid with</dt>
          <dd>{preview.paymentMethod ?? "No card on file"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <form action={confirmPlanChange.bind(null, plan, interval)}>
          <SubmitButton>
            {preview.dueNow > 0
              ? `Confirm and pay ${formatPrice(preview.dueNow, preview.currency)}`
              : "Confirm change"}
          </SubmitButton>
        </form>
        <form action={manageBilling}>
          <SubmitButton variant="outline">Change payment method</SubmitButton>
        </form>
        <Link href="/admin/billing" className="text-sm underline underline-offset-4">
          Keep current plan
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Stripe issues the invoice right away and the plan changes as soon as it is paid.
        {preview.from ? " Your next renewal keeps its date." : ""}
      </p>
    </div>
  );
}

export default function ChangePageBoundary(props: PageProps<"/admin/billing/change">) {
  return (
    <Suspense
      fallback={
        <Shell className="max-w-xl space-y-6">
          <Heading width="w-72" />
          <Card height="h-36" title={false} />
        </Shell>
      }
    >
      <ChangePage {...props} />
    </Suspense>
  );
}
