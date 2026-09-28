import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, Heading, Shell } from "@/components/skeletons/primitives";
import { SubmitButton } from "@/components/submit-button";
import { previewSeatAdd } from "@/server/billing";
import { formatPrice } from "@/server/payments";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { confirmInvite } from "../actions";

export const metadata = { title: "Confirm invitation" };

/**
 * Shown before an invitation that will add a billed seat: what Stripe charges when the person
 * accepts (prorated for the rest of the period) and what the plan costs from then on.
 */
async function InvitePage({ searchParams }: PageProps<"/admin/team/invite">) {
  const [{ role }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  if (role !== "owner" && role !== "admin") redirect("/admin/team");
  const email = typeof sp.email === "string" ? sp.email : "";
  const invitee = sp.role === "admin" ? "admin" : "member";
  if (!email) redirect("/admin/team");
  const preview = await previewSeatAdd(ws);
  if (!preview) redirect("/admin/team");
  const per = preview.interval === "year" ? "year" : "month";
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invite {email}</h1>
        <p className="text-sm text-muted-foreground">
          This adds a seat to your Team plan. Nothing is charged until they accept.
        </p>
      </div>
      <dl className="space-y-3 rounded-xl border p-5 text-sm">
        <div className="flex gap-4">
          <dt className="w-32 shrink-0 text-muted-foreground">When they join</dt>
          <dd>
            {preview.seatCost > 0 ? (
              <>
                <strong>{formatPrice(preview.seatCost, preview.currency)}</strong>, prorated for the
                rest of the current period
                {preview.dueOnAccept < preview.seatCost
                  ? preview.dueOnAccept > 0
                    ? `; ${formatPrice(preview.seatCost - preview.dueOnAccept, preview.currency)} of it comes from your credit balance and ${formatPrice(preview.dueOnAccept, preview.currency)} goes on the card`
                    : ", fully covered by your credit balance, so nothing goes on the card"
                  : ""}
              </>
            ) : (
              "Nothing now"
            )}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-32 shrink-0 text-muted-foreground">Then</dt>
          <dd>
            {formatPrice(preview.recurring, preview.currency)} per {per} for {preview.quantity}{" "}
            seats
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-32 shrink-0 text-muted-foreground">Paid with</dt>
          <dd>{preview.paymentMethod ?? "No card on file"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <form action={confirmInvite.bind(null, email, invitee)}>
          <SubmitButton>Send invitation</SubmitButton>
        </form>
        <Link href="/admin/team" className="text-sm underline underline-offset-4">
          Don&apos;t invite
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Removing a member later credits the unused part of their seat to your next invoice.
      </p>
    </div>
  );
}

export default function InvitePageBoundary(props: PageProps<"/admin/team/invite">) {
  return (
    <Suspense
      fallback={
        <Shell className="max-w-xl space-y-6">
          <Heading width="w-72" />
          <Card height="h-36" title={false} />
        </Shell>
      }
    >
      <InvitePage {...props} />
    </Suspense>
  );
}
