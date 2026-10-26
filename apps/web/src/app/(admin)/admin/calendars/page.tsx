import { CalendarsSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarDaysIcon, VideoIcon } from "lucide-react";
import type { ConferencingType, Integration } from "@bookly/db/schema";
import { ProviderIcon } from "@/components/brand-icons";
import { ConnectButton } from "@/components/connect-button";
import { Button } from "@/components/ui/button";
import { IntegrationList, IntegrationRow } from "@/components/ui/integration-row";
import { PageHeader } from "@/components/ui/page-header";
import {
  conferencingAvailability,
  listFeeds,
  listIntegrations,
  MAX_FEEDS_PER_USER,
  providerConfigured,
} from "@/server/integrations";
import { hasFeature } from "@/server/limits";
import { getProfileByUser } from "@/server/scheduling";
import { requireWorkspaceUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { IntegrationError } from "../integration-errors";
import { ConflictsForm } from "./conflicts-form";
import { ConnectionMenu } from "./connection-menu";
import { DefaultConferencing } from "./default-conferencing";
import { FeedsCard } from "./feeds-card";

export const metadata = { title: "Calendars & conferencing" };

const CALENDARS = [
  { provider: "google", name: "Google Calendar", does: "Conflict checks, bookings, Meet links" },
  {
    provider: "microsoft",
    name: "Outlook Calendar",
    does: "Conflict checks, bookings, Teams links",
  },
] as const;

const TOOL_NAME: Record<ConferencingType, string> = {
  daily: "Bookly video",
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  zoom: "Zoom",
};

/**
 * Calendars & conferencing (`mocks.png` 05): the member's own connections on one page. Calendars
 * first (which account, which calendars block their hours, where bookings land), then the video
 * tools and the one new event types start with. Everything here is personal; workspace-wide
 * services are under Settings → Integrations.
 */
async function CalendarsPage({ searchParams }: PageProps<"/admin/calendars">) {
  // Feed times and connection states are read per request.
  await connection();
  const [{ session }, sp, ws] = await Promise.all([
    requireWorkspaceUser(),
    searchParams,
    getCurrentWorkspace(),
  ]);
  const [conns, feeds, profile, avail] = await Promise.all([
    listIntegrations(session.user.id),
    listFeeds(session.user.id),
    ws ? getProfileByUser(ws.id, session.user.id) : null,
    conferencingAvailability(session.user.id),
  ]);
  const find = (p: "google" | "microsoft" | "zoom") =>
    (conns.find((c) => c.provider === p) as Integration | undefined) ?? null;
  const connected = CALENDARS.flatMap((c) => {
    const i = find(c.provider);
    return i ? [{ ...c, integration: i }] : [];
  });
  const zoom = find("zoom");
  // Bookly video is a paid feature on the hosted service: the server may have it, the plan not.
  const videoPlan = !ws || hasFeature(ws, "booklyVideo");
  const ready: Record<ConferencingType, boolean> = {
    daily: avail.daily && videoPlan,
    google_meet: avail.google_meet,
    teams: avail.teams,
    zoom: avail.zoom,
  };
  const choices = (Object.keys(TOOL_NAME) as ConferencingType[]).filter((t) => ready[t]);
  const current = profile?.defaultConferencing ?? "daily";

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="Calendars & conferencing"
        description="Connect your calendar and video tools to keep everything in sync."
      />
      <IntegrationError code={typeof sp.error === "string" ? sp.error : undefined} />
      {typeof sp.connected === "string" && (
        <p className="rounded-lg border bg-success-muted p-3 text-sm text-success" role="status">
          Connected. Pick which calendars to check for conflicts below.
        </p>
      )}

      <section aria-labelledby="connections-title" className="space-y-3">
        <h2 id="connections-title" className="text-base font-semibold tracking-tight">
          Calendar connections
        </h2>
        <IntegrationList>
          {CALENDARS.map((c) => {
            const i = find(c.provider);
            const configured = providerConfigured(c.provider);
            return (
              <IntegrationRow
                key={c.provider}
                icon={CalendarDaysIcon}
                name={c.name}
                detail={i ? (i.accountLabel ?? "Connected account") : c.does}
                status={
                  i
                    ? i.status === "error"
                      ? { label: "Needs reconnecting", tone: "destructive" }
                      : { label: "Connected", tone: "success" }
                    : configured
                      ? undefined
                      : { label: "Not set up on this server", tone: "neutral" }
                }
                action={
                  i ? (
                    <ConnectionMenu provider={c.provider} name={c.name} reload />
                  ) : configured ? (
                    <ConnectButton
                      provider={c.provider}
                      back="/admin/calendars"
                      variant="outline"
                      size="sm"
                    />
                  ) : null
                }
              >
                {i?.status === "error" && (
                  <p className="text-sm text-destructive">
                    {i.lastError ?? "The connection stopped working"}. Reconnect from ⋮ to fix it.
                  </p>
                )}
              </IntegrationRow>
            );
          })}
        </IntegrationList>
        {CALENDARS.some((c) => !providerConfigured(c.provider)) && (
          <p className="text-xs text-muted-foreground">
            A provider that is not set up needs its OAuth keys added by whoever runs this server
            (docs/integrations.md).
          </p>
        )}
      </section>

      <section aria-labelledby="conflicts-title" className="space-y-3">
        <div>
          <h2 id="conflicts-title" className="text-base font-semibold tracking-tight">
            Check for conflicts with
          </h2>
          <p className="text-sm text-muted-foreground">
            Busy events in these calendars come off your available times.
          </p>
        </div>
        {connected.length ? (
          <div className="divide-y rounded-xl border bg-card">
            {connected.map((c) => {
              const s = c.integration.settings;
              return (
                <div key={c.provider} className="p-4 sm:p-5">
                  {connected.length > 1 && (
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{c.name}</p>
                  )}
                  <ConflictsForm
                    provider={c.provider}
                    account={c.integration.accountLabel ?? c.name}
                    calendars={c.integration.calendars}
                    conflict={s.conflictCalendarIds ?? []}
                    destination={s.destinationCalendarId ?? ""}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Connect a calendar above to choose which of its calendars block your hours.
          </p>
        )}
      </section>

      <FeedsCard
        feeds={feeds.map((f) => ({
          id: f.id,
          label: f.label,
          eventCount: f.eventCount,
          status: f.status,
          lastError: f.lastError,
          lastSyncedAt: f.lastSyncedAt ? f.lastSyncedAt.toISOString() : null,
        }))}
        timezone={profile?.timezone ?? ws?.timezone ?? "UTC"}
        max={MAX_FEEDS_PER_USER}
      />

      <section id="conferencing" aria-labelledby="conferencing-title" className="space-y-3">
        <div>
          <h2 id="conferencing-title" className="text-base font-semibold tracking-tight">
            Conferencing
          </h2>
          <p className="text-sm text-muted-foreground">
            Each event type picks how you meet. A tool that is ready gets a real link on every
            confirmed booking; if it fails, Bookly video stands in where the plan includes it.
          </p>
        </div>
        <IntegrationList>
          <IntegrationRow
            mark={<ProviderIcon id="daily" />}
            name="Bookly video"
            detail="Built-in video meetings, no account needed by anyone"
            status={
              !avail.daily
                ? { label: "Not set up on this server", tone: "neutral" }
                : videoPlan
                  ? { label: "Ready to use", tone: "success" }
                  : { label: "From the Pro plan", tone: "neutral" }
            }
            action={
              avail.daily && !videoPlan ? (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/admin/billing" />}
                >
                  See plans
                </Button>
              ) : null
            }
          />
          <IntegrationRow
            icon={VideoIcon}
            name="Zoom"
            detail={
              zoom
                ? (zoom.accountLabel ?? "Connected account")
                : avail.configured.zoom
                  ? "Create a Zoom meeting for every booking"
                  : "Not set up on this server (no Zoom OAuth app)"
            }
            status={
              zoom
                ? zoom.status === "error"
                  ? { label: "Needs reconnecting", tone: "destructive" }
                  : { label: "Connected", tone: "success" }
                : undefined
            }
            action={
              zoom ? (
                <ConnectionMenu provider="zoom" name="Zoom" />
              ) : avail.configured.zoom ? (
                <ConnectButton
                  provider="zoom"
                  back="/admin/calendars"
                  variant="outline"
                  size="sm"
                />
              ) : null
            }
          >
            {zoom?.status === "error" && (
              <p className="text-sm text-destructive">
                {zoom.lastError ?? "The connection stopped working"}. Reconnect from ⋮ to fix it.
              </p>
            )}
          </IntegrationRow>
          <IntegrationRow
            icon={VideoIcon}
            name="Google Meet"
            detail={
              avail.google_meet
                ? "Links are created with the Google Calendar event"
                : "Comes with Google Calendar: connect it above"
            }
            status={avail.google_meet ? { label: "Ready to use", tone: "success" } : undefined}
          />
          <IntegrationRow
            icon={VideoIcon}
            name="Microsoft Teams"
            detail={
              avail.teams
                ? "Links are created with the Outlook event"
                : "Comes with Outlook Calendar: connect it above"
            }
            status={avail.teams ? { label: "Ready to use", tone: "success" } : undefined}
          />
        </IntegrationList>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <label htmlFor="default-conferencing" className="text-sm font-medium">
              Default conferencing tool
            </label>
            <p className="text-sm text-muted-foreground">
              New event types start with this; each can still pick its own.
            </p>
          </div>
          {profile ? (
            <DefaultConferencing
              value={ready[current] ? current : (choices[0] ?? "daily")}
              options={(choices.length ? choices : (["daily"] as ConferencingType[])).map((t) => ({
                value: t,
                label: TOOL_NAME[t],
              }))}
            />
          ) : (
            <Link
              href="/admin/profile?setup=1"
              className="text-sm font-medium text-primary hover:underline"
            >
              Set up your booking page first
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

export default function CalendarsPageBoundary(props: PageProps<"/admin/calendars">) {
  return (
    <Suspense fallback={<CalendarsSkeleton />}>
      <CalendarsPage {...props} />
    </Suspense>
  );
}
