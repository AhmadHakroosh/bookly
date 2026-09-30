import { CalendarsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import type { Integration } from "@bookly/db/schema";
import {
  listFeeds,
  listIntegrations,
  MAX_FEEDS_PER_USER,
  providerConfigured,
} from "@/server/integrations";
import { getProfileByUser } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";
import { FeedsCard } from "./feeds-card";
import { requireStaff } from "@/server/session";
import { CalendarCard } from "./calendar-card";
import { IntegrationError } from "../integration-errors";

export const metadata = { title: "Calendars" };

async function CalendarsPage({ searchParams }: PageProps<"/admin/calendars">) {
  const [{ session }, sp, ws] = await Promise.all([
    requireStaff(),
    searchParams,
    getCurrentWorkspace(),
  ]);
  const [conns, feeds, profile] = await Promise.all([
    listIntegrations(session.user.id),
    listFeeds(session.user.id),
    ws ? getProfileByUser(ws.id, session.user.id) : null,
  ]);
  const find = <P extends "google" | "microsoft">(p: P) =>
    (conns.find((c) => c.provider === p) as (Integration & { provider: P }) | undefined) ?? null;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        <p className="text-sm text-muted-foreground">
          Connect a calendar to hide times you are already busy and to add bookings to it
          automatically. Google also enables Google Meet links, Microsoft enables Teams.
        </p>
      </div>
      <IntegrationError code={typeof sp.error === "string" ? sp.error : undefined} />
      {typeof sp.connected === "string" && (
        <p className="rounded-md border p-3 text-sm">
          Connected. Pick which calendars to use below.
        </p>
      )}
      <CalendarCard
        name="Google Calendar"
        description="Conflict checks, bookings in your calendar, Google Meet links."
        integration={find("google")}
        provider="google"
        configured={providerConfigured("google")}
      />
      <CalendarCard
        name="Outlook Calendar"
        description="Conflict checks, bookings in your calendar, Microsoft Teams links."
        integration={find("microsoft")}
        provider="microsoft"
        configured={providerConfigured("microsoft")}
      />
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
