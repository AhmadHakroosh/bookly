"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneField } from "@/components/timezone-field";
import { updateWorkspaceSettings, type SettingsState } from "./actions";

type Values = {
  name: string;
  description: string;
  locale: string;
  timezone: string;
  blocklist: string;
  crmProvider: "" | "hubspot" | "pipedrive";
  crmConnected: boolean;
  crmCompanyDomain: string;
  proposalSubject: string;
  proposalBody: string;
  paymentSubject: string;
  paymentBody: string;
};

export function SettingsForm({ workspace, zones }: { workspace: Values; zones: string[] }) {
  const [state, action, pending] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  useEffect(() => {
    if (state.ok) toast.success("Settings saved");
    else if (state.error && !state.fields) toast.error(state.error);
  }, [state]);
  const err = (k: string) => state.fields?.[k]?.map((message) => ({ message }));
  return (
    <form action={action}>
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
            <Input id="locale" name="locale" defaultValue={workspace.locale} />
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
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">CRM sync</legend>
          <FieldDescription>
            Contacts, stage changes, meeting notes and sent emails are mirrored to your CRM. The key
            is stored encrypted.{workspace.crmConnected ? " Connected." : ""}
          </FieldDescription>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="crmProvider">Provider</FieldLabel>
              <select
                id="crmProvider"
                name="crmProvider"
                defaultValue={workspace.crmProvider}
                className="h-8 rounded-lg border bg-background px-2 text-sm"
              >
                <option value="">None</option>
                <option value="hubspot">HubSpot (private app token)</option>
                <option value="pipedrive">Pipedrive (API token)</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="crmApiKey">API key</FieldLabel>
              <Input
                id="crmApiKey"
                name="crmApiKey"
                type="password"
                autoComplete="off"
                placeholder={workspace.crmConnected ? "•••••• (unchanged)" : ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="crmCompanyDomain">Pipedrive company domain</FieldLabel>
              <Input
                id="crmCompanyDomain"
                name="crmCompanyDomain"
                defaultValue={workspace.crmCompanyDomain}
                placeholder="acme"
              />
            </Field>
          </div>
        </fieldset>
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Email templates</legend>
          <FieldDescription>
            Used by the Proposal and Payment request buttons on contact pages. Placeholders:{" "}
            {"{name} {company} {host} {amount} {payLink}"}. Leave blank for the defaults.
          </FieldDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="proposalSubject">Proposal subject</FieldLabel>
              <Input
                id="proposalSubject"
                name="proposalSubject"
                defaultValue={workspace.proposalSubject}
              />
              <Textarea
                name="proposalBody"
                rows={6}
                defaultValue={workspace.proposalBody}
                aria-label="Proposal body"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="paymentSubject">Payment request subject</FieldLabel>
              <Input
                id="paymentSubject"
                name="paymentSubject"
                defaultValue={workspace.paymentSubject}
              />
              <Textarea
                name="paymentBody"
                rows={6}
                defaultValue={workspace.paymentBody}
                aria-label="Payment request body"
              />
            </Field>
          </div>
        </fieldset>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </FieldGroup>
    </form>
  );
}
