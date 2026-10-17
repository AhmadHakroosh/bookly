import { SettingsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import Link from "next/link";
import { PLANS, planFor } from "@bookly/cloud";
import { guestRepliesStatus, type GuestRepliesStatus } from "@/server/inbound";
import { getStaffRole, isManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { EmailsForm } from "./emails-form";
import { GuestRepliesToggle } from "./guest-replies";

const STATUS: Record<GuestRepliesStatus, string> = {
  on: "Replies to your emails land on each contact's timeline, under the email they answer, and you get a copy.",
  off: "Replies go to the sender's own address. Replies to emails sent while this was on still reach the timeline.",
  plan: "Replies go to the sender's own address.",
  unconfigured:
    "Replies go to the sender's own address: this server has no inbound email domain (docs/self-hosting.md).",
  unavailable:
    "Replies go to the sender's own address. Replies on the timeline are not enabled for this workspace yet.",
};

export const metadata = { title: "Emails" };

async function EmailsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const t = workspace.settings.templates ?? {};
  const [status, role] = await Promise.all([guestRepliesStatus(workspace), getStaffRole()]);
  const canToggle = (status === "on" || status === "off") && isManager(role);
  return (
    <div className="max-w-xl space-y-6">
      <section aria-labelledby="guest-replies" className="space-y-3 rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="guest-replies" className="text-base font-semibold tracking-tight">
              Guest replies
            </h2>
            <p className="mt-1 text-sm text-muted-foreground" role="status">
              {STATUS[status]}
            </p>
            {status === "plan" && (
              <p className="mt-1 text-sm">
                Replies on the timeline come with {PLANS[planFor("inboundEmail")].name}.{" "}
                <Link href="/admin/billing" className="underline underline-offset-4">
                  Upgrade
                </Link>
              </p>
            )}
          </div>
          {canToggle && <GuestRepliesToggle on={status === "on"} />}
        </div>
      </section>
      <div>
        <p className="text-sm text-muted-foreground">
          Your wording for the emails Bookly sends on the workspace&apos;s behalf. Each event type
          can still carry its own follow-up message, which wins over the one here.
        </p>
      </div>
      <EmailsForm
        templates={{
          confirmationSubject: t.confirmation?.subject ?? "",
          confirmationBody: t.confirmation?.body ?? "",
          reminderSubject: t.reminder?.subject ?? "",
          reminderBody: t.reminder?.body ?? "",
          cancellationSubject: t.cancellation?.subject ?? "",
          cancellationBody: t.cancellation?.body ?? "",
          proposalSubject: t.proposal?.subject ?? "",
          proposalBody: t.proposal?.body ?? "",
          paymentSubject: t.paymentRequest?.subject ?? "",
          paymentBody: t.paymentRequest?.body ?? "",
          checkInSubject: t.checkIn?.subject ?? "",
          checkInBody: t.checkIn?.body ?? "",
        }}
      />
    </div>
  );
}

export default function EmailsPageBoundary() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <EmailsPage />
    </Suspense>
  );
}
