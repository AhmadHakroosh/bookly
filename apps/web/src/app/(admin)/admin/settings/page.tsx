import { isCloud } from "@/server/platform";
import { timezoneList } from "@/lib/time";
import { getCurrentWorkspace } from "@/server/workspace";
import { Suspense } from "react";
import { requireStaff } from "@/server/session";
import { DangerZone } from "./danger-zone";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

async function SettingsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const { role } = await requireStaff();
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The workspace name appears in the admin header and in email footers. The default timezone
          is used for new booking pages and schedules.
        </p>
      </div>
      <SettingsForm
        workspace={{
          name: workspace.name,
          description: workspace.description ?? "",
          locale: workspace.locale,
          timezone: workspace.timezone,
          blocklist: ((workspace.settings.blockedEmails as string[] | undefined) ?? []).join("\n"),
          crmProvider: workspace.settings.crm?.provider ?? "",
          crmConnected: !!workspace.settings.crm?.apiKey,
          crmCompanyDomain: workspace.settings.crm?.companyDomain ?? "",
          proposalSubject: workspace.settings.templates?.proposal?.subject ?? "",
          proposalBody: workspace.settings.templates?.proposal?.body ?? "",
          paymentSubject: workspace.settings.templates?.paymentRequest?.subject ?? "",
          paymentBody: workspace.settings.templates?.paymentRequest?.body ?? "",
          telemetryStats: !!workspace.settings.telemetryStats,
        }}
        selfHosted={!isCloud()}
        zones={timezoneList()}
      />
      <div className="border-t pt-6">
        <h2 className="mb-1 text-xl font-semibold tracking-tight">Your data</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Take a copy of everything, or delete the workspace for good.
        </p>
        <DangerZone slug={workspace.slug} owner={role === "owner"} cloud={isCloud()} />
      </div>
    </div>
  );
}

/** Suspense boundary for Cache Components: the page reads request data and streams in. */
export default function SettingsPageBoundary() {
  return (
    <Suspense fallback={null}>
      <SettingsPage />
    </Suspense>
  );
}
