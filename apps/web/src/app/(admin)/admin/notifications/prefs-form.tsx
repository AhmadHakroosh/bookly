"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { HostNotifications } from "@bookly/db/schema";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveNotificationPrefs, type PrefsState } from "./actions";
import { Dropdown } from "@/components/dropdown";

export function PrefsForm({
  phone,
  prefs,
  channels,
  selfHosted,
}: {
  phone: string;
  prefs: HostNotifications;
  channels: { sms: boolean; whatsapp: boolean };
  /** Self-hosted installs get told what to configure; cloud hosts only that texts are off. */
  selfHosted: boolean;
}) {
  const [state, action] = useActionState(saveNotificationPrefs, {} as PrefsState);
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  const textAvailable = channels.sms || channels.whatsapp;
  const off = selfHosted ? " (not set up on this server)" : " (not available yet)";
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
            <Dropdown
              id="channel"
              name="channel"
              defaultValue={prefs.channel ?? "none"}
              className="w-72"
              options={[
                { value: "none", label: "Email only" },
                {
                  value: "whatsapp",
                  label: `WhatsApp${channels.whatsapp ? "" : off}`,
                  disabled: !channels.whatsapp,
                },
                {
                  value: "sms",
                  label: `SMS${channels.sms ? "" : off}`,
                  disabled: !channels.sms,
                },
              ]}
            />
            {!textAvailable && (
              <FieldDescription>
                {selfHosted
                  ? "Text messages need a provider on the server, Sent.dm or Twilio (docs/notifications.md)."
                  : "Text messages are not available on Bookly Cloud yet; email and Slack work today."}
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
                "an attendee joins the video room (Bookly video only)",
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
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </FieldGroup>
    </form>
  );
}
