import { SettingsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { getCurrentWorkspace } from "@/server/workspace";
import { EmailsForm } from "./emails-form";

export const metadata = { title: "Emails" };

async function EmailsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const t = workspace.settings.templates ?? {};
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Emails</h2>
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
