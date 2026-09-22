"use client";

import { useActionState } from "react";
import { API_SCOPES, WEBHOOK_EVENTS } from "@bookly/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiKey, createWebhook, type HookState, type KeyState } from "./actions";

function Secret({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/50 p-3 text-sm">
      <p className="font-medium">{label}</p>
      <code className="mt-1 block break-all select-all">{value}</code>
      <p className="mt-1 text-xs text-muted-foreground">Copy it now. It is not shown again.</p>
    </div>
  );
}

export function ApiKeyForm() {
  const [state, action, pending] = useActionState(createApiKey, {} as KeyState);
  return (
    <form action={action} className="max-w-2xl space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          name="name"
          placeholder="Key name (e.g. personal workspace)"
          required
          className="min-w-56 flex-1"
        />
        <Button type="submit" disabled={pending}>
          Create key
        </Button>
      </div>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">Scopes</legend>
        {API_SCOPES.map((s) => (
          <label key={s} className="inline-flex items-center gap-1">
            <input type="checkbox" name="scopes" value={s} defaultChecked={s === "bookings:read"} />{" "}
            {s}
          </label>
        ))}
      </fieldset>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.created && (
        <Secret label={`API key “${state.created.name}”`} value={state.created.raw} />
      )}
    </form>
  );
}

export function WebhookForm() {
  const [state, action, pending] = useActionState(createWebhook, {} as HookState);
  return (
    <form action={action} className="max-w-2xl space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          name="url"
          type="url"
          placeholder="https://example.com/hooks/bookly"
          required
          className="min-w-56 flex-1"
        />
        <Input
          name="description"
          placeholder="Description (optional)"
          className="min-w-40 flex-1 sm:w-48 sm:flex-none"
        />
        <Button type="submit" disabled={pending}>
          Add webhook
        </Button>
      </div>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">Events</legend>
        {WEBHOOK_EVENTS.map((e) => (
          <label key={e} className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              name="events"
              value={e}
              defaultChecked={e === "booking.created"}
            />{" "}
            {e}
          </label>
        ))}
      </fieldset>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.created && (
        <Secret label={`Signing secret for ${state.created.url}`} value={state.created.secret} />
      )}
    </form>
  );
}
