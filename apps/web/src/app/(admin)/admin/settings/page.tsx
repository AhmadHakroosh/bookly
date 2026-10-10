import { SettingsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { timezoneList } from "@/lib/time";
import { dailyConfigured } from "@/server/integrations";
import { isCloud } from "@/server/platform";
import { getCurrentWorkspace } from "@/server/workspace";
import { betaFlagsFor, FLAGS } from "@/server/flags";
import { BetaToggle } from "./beta-toggle";
import { GeneralForm } from "./general-form";
import { JoinToggle } from "./join-toggle";

export const metadata = { title: "Settings" };

async function GeneralPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const joinEnabled = workspace.settings.daily?.joinPings !== false;
  const optedOut = !!workspace.settings.betaOptOut;
  const betas = await betaFlagsFor(workspace);
  return (
    <div className="max-w-xl space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          The workspace name appears in the admin header and in email footers. The default timezone
          is used for new booking pages and schedules.
        </p>
      </div>
      <GeneralForm
        workspace={{
          name: workspace.name,
          description: workspace.description ?? "",
          locale: workspace.locale,
          timezone: workspace.timezone,
          blocklist: ((workspace.settings.blockedEmails as string[] | undefined) ?? []).join("\n"),
          postalAddress: workspace.settings.postalAddress ?? "",
          telemetryStats: !!workspace.settings.telemetryStats,
        }}
        selfHosted={!isCloud()}
        zones={timezoneList()}
      />
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              Attendee joined
              <Badge variant={joinEnabled ? "default" : "secondary"}>
                {joinEnabled ? "On" : "Off"}
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              When the first attendee enters a Bookly video room, hosts who asked for it under
              Notifications get a ping. Turning this off mutes it for the whole workspace.
            </p>
          </div>
          {dailyConfigured() && <JoinToggle enabled={joinEnabled} />}
        </div>
        {!dailyConfigured() && (
          <p className="text-xs text-muted-foreground">
            Bookly video is not configured on this server.
          </p>
        )}
      </section>
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              Beta features
              <Badge variant={optedOut ? "secondary" : "default"}>{optedOut ? "Off" : "On"}</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              New features reach a few workspaces first, marked “Beta” on their page, before
              everyone gets them. Opting out keeps this workspace on finished features only.
            </p>
          </div>
          <BetaToggle optedOut={optedOut} />
        </div>
        {betas.length > 0 && !optedOut && (
          <ul className="text-xs text-muted-foreground">
            {betas.map((k) => (
              <li key={k}>· {FLAGS[k]}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Suspense boundary for Cache Components: the page reads request data and streams in. */
export default function GeneralPageBoundary() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <GeneralPage />
    </Suspense>
  );
}
