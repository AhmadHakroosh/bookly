import { SettingsSkeleton } from "@/components/skeletons/pages";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { paymentsConfigured } from "@/server/payments";
import { isCloud } from "@/server/platform";
import { getCurrentWorkspace } from "@/server/workspace";
import { PaymentsCard } from "../payments-card";

export const metadata = { title: "Payments" };

/** Cloud only: Stripe Connect for the workspace. The layout already limited this to owner/admin. */
async function PaymentsPage() {
  if (!isCloud() || !paymentsConfigured()) notFound();
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Payments</h2>
        <p className="text-sm text-muted-foreground">
          Where the money from paid event types and payment requests goes. Plan and invoices for
          Bookly itself are under Billing.
        </p>
      </div>
      <PaymentsCard ws={workspace} canManage />
    </div>
  );
}

export default function PaymentsPageBoundary() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <PaymentsPage />
    </Suspense>
  );
}
