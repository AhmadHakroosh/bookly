"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { Integration } from "@bookly/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/connect-button";
import { disconnect, reloadCalendars, saveCalendarSettings } from "../integrations-actions";

export function CalendarCard({
  name,
  provider,
  integration,
  configured,
  description,
}: {
  name: string;
  provider: "google" | "microsoft";
  integration: (Integration & { provider: "google" | "microsoft" }) | null;
  configured: boolean;
  description: string;
}) {
  const [state, action, pending] = useActionState(
    saveCalendarSettings,
    {} as { ok?: boolean; error?: string },
  );
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);

  if (!integration) {
    return (
      <section className="rounded-xl border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{name}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {configured ? (
            <ConnectButton provider={provider} back="/admin/calendars" />
          ) : (
            <Badge variant="secondary">Not set up on this server</Badge>
          )}
        </div>
        {!configured && (
          <p className="mt-3 text-xs text-muted-foreground">
            The server admin needs to add the OAuth client keys (see docs/integrations.md).
          </p>
        )}
      </section>
    );
  }

  const s = integration.settings;
  const conflict = new Set(s.conflictCalendarIds ?? []);
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{name}</h2>
          <p className="text-sm text-muted-foreground">
            Connected as {integration.accountLabel ?? "unknown account"}
          </p>
          {integration.status === "error" && (
            <p className="mt-1 text-sm text-destructive">
              Connection broken: {integration.lastError}. Reconnect to fix it.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <ConnectButton
            provider={provider}
            back="/admin/calendars"
            label="Reconnect"
            variant="outline"
          />
          <form action={() => disconnect(integration.provider)}>
            <Button variant="ghost" type="submit">
              Disconnect
            </Button>
          </form>
        </div>
      </div>

      <form action={action} className="space-y-4 text-sm">
        <input type="hidden" name="provider" value={integration.provider} />
        <div>
          <p className="mb-1 font-medium">Check for conflicts in</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Busy events in these calendars are removed from your available times.
          </p>
          <ul className="space-y-1">
            {integration.calendars.map((c) => (
              <li key={c.id}>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="conflict"
                    value={c.id}
                    defaultChecked={conflict.has(c.id)}
                  />
                  {c.name}
                  {c.primary && <span className="text-xs text-muted-foreground">(primary)</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <label className="mb-1 block font-medium" htmlFor={`dest-${integration.provider}`}>
            Add new bookings to
          </label>
          <select
            id={`dest-${integration.provider}`}
            name="destinationCalendarId"
            defaultValue={s.destinationCalendarId ?? ""}
            className="h-8 rounded-lg border bg-background px-2"
          >
            {integration.calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <button
            type="button"
            onClick={() => reloadCalendars(integration.provider)}
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Reload calendar list
          </button>
        </div>
      </form>
    </section>
  );
}
