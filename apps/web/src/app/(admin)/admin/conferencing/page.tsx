import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { conferencingAvailability, listIntegrations } from "@/server/integrations";
import { requireStaff } from "@/server/session";
import { hasFeature } from "@/server/limits";
import { getCurrentWorkspace } from "@/server/workspace";
import { ConnectButton } from "@/components/connect-button";
import { disconnect } from "../integrations-actions";
import { IntegrationError } from "../integration-errors";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Conferencing" };

async function ConferencingPage({ searchParams }: PageProps<"/admin/conferencing">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  const [avail, conns] = await Promise.all([
    conferencingAvailability(session.user.id),
    listIntegrations(session.user.id),
  ]);
  const zoom = conns.find((c) => c.provider === "zoom") ?? null;
  // Bookly video is a paid feature in cloud mode: the server may have Daily, the plan may not.
  const videoPlan = !ws || hasFeature(ws, "booklyVideo");
  const rows: {
    name: string;
    ok: boolean;
    /** Shown in place of "Not ready" when the plan, not the setup, is what is missing. */
    badge?: string;
    note: React.ReactNode;
    action?: React.ReactNode;
  }[] = [
    {
      name: "Bookly video",
      ok: avail.daily && videoPlan,
      badge: avail.daily && !videoPlan ? "Pro" : undefined,
      note: !avail.daily ? (
        "Not set up on this server. The admin adds a Daily.co API key (docs/integrations.md)."
      ) : videoPlan ? (
        "Ready. A private room is created for every booking; no account needed by anyone."
      ) : (
        <>
          A private room for every booking, no account needed by anyone. Included from the Pro plan.{" "}
          <Link href="/admin/billing" className="underline underline-offset-4">
            See plans
          </Link>
          .
        </>
      ),
    },
    {
      name: "Google Meet",
      ok: avail.google_meet,
      note: avail.google_meet ? (
        "Ready. Meet links are created with the calendar event."
      ) : (
        <>
          Connect Google under{" "}
          <Link href="/admin/calendars" className="underline underline-offset-4">
            Calendars
          </Link>
          .
        </>
      ),
    },
    {
      name: "Microsoft Teams",
      ok: avail.teams,
      note: avail.teams ? (
        "Ready. Teams links are created with the Outlook event."
      ) : (
        <>
          Connect Microsoft under{" "}
          <Link href="/admin/calendars" className="underline underline-offset-4">
            Calendars
          </Link>
          .
        </>
      ),
    },
    {
      name: "Zoom",
      ok: avail.zoom,
      note: zoom
        ? `Connected as ${zoom.accountLabel ?? "unknown"}${zoom.status === "error" ? ` · broken: ${zoom.lastError}` : ""}`
        : avail.configured.zoom
          ? "Connect your Zoom account to create meetings automatically."
          : "Not set up on this server (no Zoom OAuth app).",
      action: zoom ? (
        <div className="flex gap-2">
          <ConnectButton
            provider="zoom"
            back="/admin/conferencing"
            label="Reconnect"
            variant="outline"
          />
          <form action={() => disconnect("zoom")}>
            <SubmitButton variant="ghost">Disconnect</SubmitButton>
          </form>
        </div>
      ) : avail.configured.zoom ? (
        <ConnectButton provider="zoom" back="/admin/conferencing" />
      ) : undefined,
    },
  ];
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conferencing</h1>
        <p className="text-sm text-muted-foreground">
          Each event type picks a location. Anything marked ready gets a real meeting link on every
          confirmed booking. If a provider fails, Bookly falls back to Bookly video where the plan
          includes it, then to a plain note in the email.
        </p>
      </div>
      <IntegrationError code={typeof sp.error === "string" ? sp.error : undefined} />
      <ul className="divide-y rounded-xl border">
        {rows.map((r) => (
          <li key={r.name} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {r.name}
                <Badge variant={r.ok ? "default" : r.badge ? "outline" : "secondary"}>
                  {r.ok ? "Ready" : (r.badge ?? "Not ready")}
                </Badge>
              </p>
              <p className="text-sm text-muted-foreground">{r.note}</p>
            </div>
            {r.action}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ConferencingPageBoundary(props: PageProps<"/admin/conferencing">) {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl">
          <PageSkeleton />
        </div>
      }
    >
      <ConferencingPage {...props} />
    </Suspense>
  );
}
