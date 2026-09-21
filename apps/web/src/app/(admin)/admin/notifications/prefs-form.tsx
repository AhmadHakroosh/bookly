"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { HostNotifications } from "@bookly/db/schema";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveNotificationPrefs, type PrefsState } from "./actions";

export function PrefsForm({
  phone,
  prefs,
  channels,
}: {
  phone: string;
  prefs: HostNotifications;
  channels: { sms: boolean; whatsapp: boolean };
}) {
  const [state, action, pending] = useActionState(saveNotificationPrefs, {} as PrefsState);
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  const textAvailable = channels.sms || channels.whatsapp;
  return (
    <form action={action}>
      <FieldGroup>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="phone">Your phone</FieldLabel>
            <Input id="phone" name="phone" defaultValue={phone} placeholder="+972501234567" />
            <FieldDescription>
              International format. Used only for the pings below.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="channel">Text me via</FieldLabel>
            <select
              id="channel"
              name="channel"
              defaultValue={prefs.channel ?? "none"}
              className="h-8 rounded-lg border bg-background px-2 text-sm"
            >
              <option value="none">Email only</option>
              <option value="whatsapp" disabled={!channels.whatsapp}>
                WhatsApp{channels.whatsapp ? "" : " (not set up on this server)"}
              </option>
              <option value="sms" disabled={!channels.sms}>
                SMS{channels.sms ? "" : " (not set up on this server)"}
              </option>
            </select>
            {!textAvailable && (
              <FieldDescription>
                Text messages need Twilio keys on the server (docs/notifications.md).
              </FieldDescription>
            )}
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="slackWebhookUrl">Slack incoming webhook (optional)</FieldLabel>
          <Input
            id="slackWebhookUrl"
            name="slackWebhookUrl"
            defaultValue={prefs.slackWebhookUrl ?? ""}
            placeholder="https://hooks.slack.com/services/…"
          />
        </Field>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1 text-base font-semibold tracking-tight">Ping me when</legend>
          {(
            [
              ["onBooking", "someone books a call", prefs.onBooking ?? true],
              ["onCancel", "an attendee cancels", prefs.onCancel ?? true],
              [
                "onJoin",
                "an attendee joins the video room (built-in video only)",
                prefs.onJoin ?? true,
              ],
              ["reminder1h", "a call starts in one hour", prefs.reminder1h ?? false],
            ] as [string, string, boolean][]
          ).map(([name, label, on]) => (
            <label key={name} className="flex items-center gap-2">
              <input type="checkbox" name={name} defaultChecked={on} /> {label}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </FieldGroup>
    </form>
  );
}
