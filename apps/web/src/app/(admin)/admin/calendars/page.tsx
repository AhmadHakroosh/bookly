import { Suspense } from "react";
import type { Integration } from "@bookly/db/schema";
import { listIntegrations, providerConfigured } from "@/server/integrations";
import { requireStaff } from "@/server/session";
import { CalendarCard } from "./calendar-card";

export const metadata = { title: "Calendars" };

const ERRORS: Record<string, string> = {
  not_configured: "That provider is not set up on this server.",
  state: "The sign-in link expired. Please try again.",
  mismatch: "Please sign in with the same account you started from.",
  exchange: "The provider rejected the connection. Check the OAuth app settings and try again.",
  access_denied: "You cancelled the connection.",
  limit: "Your plan's limit on connected accounts is reached. See Billing to upgrade.",
};

async function CalendarsPage({ searchParams }: PageProps<"/admin/calendars">) {
  const [{ session }, sp] = await Promise.all([requireStaff(), searchParams]);
  const conns = await listIntegrations(session.user.id);
  const find = <P extends "google" | "microsoft">(p: P) =>
    (conns.find((c) => c.provider === p) as (Integration & { provider: P }) | undefined) ?? null;
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? sp.error) : null;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        <p className="text-sm text-muted-foreground">
          Connect a calendar to hide times you are already busy and to add bookings to it
          automatically. Google also enables Google Meet links, Microsoft enables Teams.
        </p>
      </div>
      {error && <p className="rounded-md border border-destructive/40 p-3 text-sm">{error}</p>}
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
    <Suspense fallback={null}>
      <CalendarsPage {...props} />
    </Suspense>
  );
}
