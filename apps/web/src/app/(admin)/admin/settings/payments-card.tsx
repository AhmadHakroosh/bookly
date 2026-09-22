import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import type { Workspace } from "@bookly/db/schema";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { platformFeePercent } from "@/server/connect";
import { hasFeature } from "@/server/limits";
import { paymentsFor } from "@/server/payments";
import {
  connectStripeAction,
  disconnectStripeAction,
  openStripeDashboardAction,
  refreshStripeAction,
} from "./payments-actions";

/**
 * Cloud mode: where the money from paid bookings goes. Guests pay the host's own Stripe
 * account, connected here through Stripe's onboarding; Bookly keeps the platform fee shown.
 */
export async function PaymentsCard({ ws, canManage }: { ws: Workspace; canManage: boolean }) {
  const route = paymentsFor(ws);
  const allowed = hasFeature(ws, "payments");
  const st = ws.settings.payments;
  const fee = await platformFeePercent(ws);
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-base font-semibold tracking-tight">Payments</h2>
      <p className="text-sm text-muted-foreground">
        Paid event types and payment requests charge your guests through your own Stripe account, so
        the money is paid out to you by Stripe.
        {fee > 0
          ? ` Bookly keeps a ${fee}% platform fee on each payment; Stripe's own fees apply as usual.`
          : " Stripe's own fees apply; no platform fee is set at the moment."}
      </p>
      {!allowed ? (
        <p className="rounded-md border border-(--brand)/40 bg-(--brand)/10 p-3 text-sm">
          Paid bookings come with Pro and Team.{" "}
          <Link href="/admin/billing" className="underline underline-offset-4">
            See plans
          </Link>
        </p>
      ) : !ws.stripeAccountId ? (
        <div className="flex flex-wrap items-center gap-3">
          <form action={connectStripeAction}>
            <SubmitButton disabled={!canManage}>Connect Stripe</SubmitButton>
          </form>
          <span className="text-xs text-muted-foreground">
            Takes a few minutes on Stripe. Existing Stripe users sign in; new ones create an
            account.
          </span>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{ws.stripeAccountId}</span>
            {route.ok ? (
              <Badge>Ready</Badge>
            ) : (
              <Badge variant="secondary">
                {st?.detailsSubmitted ? "Under review by Stripe" : "Onboarding not finished"}
              </Badge>
            )}
            {st?.chargesEnabled && !st.payoutsEnabled && (
              <Badge variant="outline">Payouts pending</Badge>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {!route.ok && (
              <form action={connectStripeAction}>
                <SubmitButton disabled={!canManage}>Continue on Stripe</SubmitButton>
              </form>
            )}
            <form action={openStripeDashboardAction}>
              <SubmitButton variant="outline" disabled={!canManage}>
                Stripe dashboard <ExternalLinkIcon className="size-3.5" />
              </SubmitButton>
            </form>
            <form action={refreshStripeAction}>
              <SubmitButton variant="ghost" disabled={!canManage}>
                Refresh status
              </SubmitButton>
            </form>
            <form action={disconnectStripeAction}>
              <SubmitButton variant="ghost" disabled={!canManage} className="text-destructive">
                Disconnect
              </SubmitButton>
            </form>
          </div>
          {!route.ok && (
            <p className="text-xs text-muted-foreground">
              Prices on your event types are ignored until Stripe enables charges on the account.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
