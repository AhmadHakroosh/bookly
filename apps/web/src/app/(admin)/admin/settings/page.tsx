import { timezoneList } from "@/lib/time";
import { getCurrentWorkspace } from "@/server/workspace";
import { Suspense } from "react";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

async function SettingsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
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
        }}
        zones={timezoneList()}
      />
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
