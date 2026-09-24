import { Suspense } from "react";
import type { Integration } from "@bookly/db/schema";
import { listIntegrations, providerConfigured } from "@/server/integrations";
import { requireStaff } from "@/server/session";
import { CalendarCard } from "./calendar-card";
import { IntegrationError } from "../integration-errors";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Calendars" };

async function CalendarsPage({ searchParams }: PageProps<"/admin/calendars">) {
  const [{ session }, sp] = await Promise.all([requireStaff(), searchParams]);
  const conns = await listIntegrations(session.user.id);
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
    </div>
  );
}

export default function CalendarsPageBoundary(props: PageProps<"/admin/calendars">) {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl">
          <PageSkeleton />
        </div>
      }
    >
      <CalendarsPage {...props} />
    </Suspense>
  );
}
