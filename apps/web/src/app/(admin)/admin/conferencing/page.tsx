import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { conferencingAvailability, listIntegrations } from "@/server/integrations";
import { requireStaff } from "@/server/session";
import { ConnectButton } from "@/components/connect-button";
import { disconnect } from "../integrations-actions";

export const metadata = { title: "Conferencing" };

async function ConferencingPage({ searchParams }: PageProps<"/admin/conferencing">) {
  const [{ session }, sp] = await Promise.all([requireStaff(), searchParams]);
  const [avail, conns] = await Promise.all([
    conferencingAvailability(session.user.id),
    listIntegrations(session.user.id),
  ]);
  const zoom = conns.find((c) => c.provider === "zoom") ?? null;
  const rows: { name: string; ok: boolean; note: React.ReactNode; action?: React.ReactNode }[] = [
    {
      name: "Built-in video",
      ok: avail.daily,
      note: avail.daily
        ? "Ready. A private room is created for every booking; no account needed by anyone."
        : "Not set up on this server. The admin adds a Daily.co API key (docs/integrations.md).",
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
            <Button variant="ghost" size="sm" type="submit">
              Disconnect
            </Button>
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
          confirmed booking. If a provider fails, Bookly falls back to built-in video, then to a
          plain note in the email.
        </p>
      </div>
      {typeof sp.error === "string" && (
        <p className="rounded-md border border-destructive/40 p-3 text-sm">
          Connection failed ({sp.error}). Please try again.
        </p>
      )}
      <ul className="divide-y rounded-xl border">
        {rows.map((r) => (
          <li key={r.name} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="font-medium">
                {r.name}{" "}
                <Badge variant={r.ok ? "default" : "secondary"}>
                  {r.ok ? "Ready" : "Not ready"}
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
    <Suspense fallback={null}>
      <ConferencingPage {...props} />
    </Suspense>
  );
}
