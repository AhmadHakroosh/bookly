"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneField } from "@/components/timezone-field";
import { Dropdown } from "@/components/dropdown";
import { localeOptions } from "@/lib/locales";
import { updateWorkspaceSettings, type SettingsState } from "./actions";

type Values = {
  name: string;
  description: string;
  locale: string;
  timezone: string;
  blocklist: string;
  postalAddress: string;
  telemetryStats: boolean;
};

export function GeneralForm({
  workspace,
  zones,
  selfHosted = false,
}: {
  workspace: Values;
  zones: string[];
  selfHosted?: boolean;
}) {
  const [state, action] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  useEffect(() => {
    if (state.ok) toast.success("Settings saved");
    else if (state.error && !state.fields) toast.error(state.error);
  }, [state]);
  const err = (k: string) => state.fields?.[k]?.map((message) => ({ message }));
  return (
    <form action={action}>
      <input type="hidden" name="section" value="general" />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Workspace name</FieldLabel>
          <Input id="name" name="name" defaultValue={workspace.name} required />
          <FieldError errors={err("name")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            name="description"
            defaultValue={workspace.description}
            rows={3}
          />
          <FieldError errors={err("description")} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="locale">Locale</FieldLabel>
            <Dropdown
              id="locale"
              name="locale"
              defaultValue={workspace.locale}
              options={localeOptions(workspace.locale)}
              contentClassName="max-h-80"
            />
            <FieldDescription>
              Language and region kept with the workspace for date and number formatting.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="timezone">Default timezone</FieldLabel>
            <TimezoneField name="timezone" defaultValue={workspace.timezone} zones={zones} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="blocklist">Block bookings from</FieldLabel>
          <Textarea
            id="blocklist"
            name="blocklist"
            rows={3}
            defaultValue={workspace.blocklist}
            placeholder={"spammer@example.com\n@throwaway.example"}
          />
          <FieldDescription>
            One email or @domain per line. Matching visitors are refused on every booking page.
            Public forms are also limited to 10 submissions per 10 minutes per visitor.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="postalAddress">Postal address</FieldLabel>
          <Input
            id="postalAddress"
            name="postalAddress"
            defaultValue={workspace.postalAddress}
            placeholder="Acme Ltd, 1 Example Street, City, Country"
          />
          <FieldDescription>
            Printed in the footer of proposals, payment requests and follow-ups next to the
            unsubscribe link. Commercial-email law (CAN-SPAM and its equivalents) requires a
            physical address on those emails, so add one before you send any.
          </FieldDescription>
          <FieldError errors={err("postalAddress")} />
        </Field>
        {selfHosted && (
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-base font-semibold tracking-tight">
              Help improve Bookly
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                name="telemetryStats"
                value="on"
                defaultChecked={workspace.telemetryStats}
                className="mt-0.5"
                aria-label="Share anonymous usage statistics"
              />
              <span>
                Share anonymous usage statistics with the project: counts of workspaces, hosts,
                event types, bookings, contacts and which integrations are connected. Never names,
                emails or content.
              </span>
            </label>
            <FieldDescription>
              The daily update check itself only sends the version, tenancy mode and a random
              install id; set <code>TELEMETRY=off</code> to disable it.
            </FieldDescription>
          </fieldset>
        )}
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </FieldGroup>
    </form>
  );
}
