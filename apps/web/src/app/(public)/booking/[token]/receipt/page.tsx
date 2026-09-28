import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { formatPrice } from "@/server/payments";
import { getBookingByToken, getProfileByUser } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";
import { PublicContainer, PublicSkeleton } from "../../../container";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Receipt", robots: { index: false } };

/**
 * The workspace's own receipt for a paid booking, in its name and branding: what was paid,
 * to whom, by whom, when, with the Stripe receipt as the underlying payment record. Stripe's
 * receipt itself carries the platform's name, since the charge runs on the platform account.
 */
async function ReceiptPage({ params }: PageProps<"/booking/[token]/receipt">) {
  const { token } = await params;
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id) notFound();
  if ((b.paymentStatus !== "paid" && b.paymentStatus !== "refunded") || b.amountCents == null)
    notFound();
  const [host, et] = await Promise.all([
    getProfileByUser(ws.id, b.hostUserId),
    b.eventTypeId
      ? db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
      : null,
  ]);
  const ref = b.paymentRef ?? {};
  const paidAt = ref.paidAt ? new Date(ref.paidAt) : b.updatedAt;
  const refunded = b.paymentStatus === "refunded";
  const reference = ref.paymentIntentId?.replace(/^pi_/, "").slice(-12).toUpperCase() ?? null;
  const rows: [string, React.ReactNode][] = [
    ["Paid to", ws.name + (ws.settings.postalAddress ? `, ${ws.settings.postalAddress}` : "")],
    ["Paid by", `${b.attendeeName} · ${b.attendeeEmail}`],
    ["Date", fmtDateTime(paidAt, b.timezone)],
    [
      "For",
      `${et?.title ?? "Meeting"}${et ? ` · ${et.durationMin} min` : ""} with ${host?.displayName ?? "the host"} on ${fmtDateTime(b.startAt, b.timezone)}`,
    ],
    ["Amount", formatPrice(b.amountCents, b.currency)],
    ["Status", refunded ? "Refunded" : "Paid"],
    ...(reference ? ([["Reference", reference]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <PublicContainer className="py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">
          {refunded ? "Refund receipt" : "Receipt"}
        </h1>
        <dl className="mt-6 space-y-3 rounded-xl border p-5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-4">
              <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <PrintButton />
          {ref.receiptUrl && (
            <a
              href={ref.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Card receipt from Stripe
            </a>
          )}
          <Link href={`/booking/${token}`} className="underline underline-offset-4 print:hidden">
            Back to the booking
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Payment processed by Stripe on behalf of {ws.name}.
        </p>
      </div>
    </PublicContainer>
  );
}

export default function ReceiptPageBoundary(props: PageProps<"/booking/[token]/receipt">) {
  return (
    <Suspense fallback={<PublicSkeleton width="max-w-lg" />}>
      <ReceiptPage {...props} />
    </Suspense>
  );
}
