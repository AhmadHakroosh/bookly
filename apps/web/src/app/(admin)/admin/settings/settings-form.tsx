"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  telemetryStats: boolean;
};

export function SettingsForm({
  workspace,
  zones,
  selfHosted = false,
}: {
  workspace: Values;
  zones: string[];
  selfHosted?: boolean;
}) {
  const [state, action, pending] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  const [crm, setCrm] = useState<Values["crmProvider"]>(workspace.crmProvider);
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
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-base font-semibold tracking-tight">CRM sync</legend>
          <FieldDescription>
            Mirror contacts, stage changes, meeting notes and sent emails to the CRM your team
            already uses. Pick one; the token is stored encrypted.
          </FieldDescription>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="CRM">
            {(
              [
                ["", "None", "Keep contacts in Bookly only."],
                ["hubspot", "HubSpot", "Contacts, notes and stages as HubSpot properties."],
                ["pipedrive", "Pipedrive", "Persons, notes and stages in your Pipedrive account."],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm ${crm === value ? "border-foreground bg-muted/50" : "hover:bg-muted/30"}`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="crmProvider"
                    value={value}
                    checked={crm === value}
                    onChange={() => setCrm(value)}
                    className="accent-foreground"
                  />
                  {label}
                  {value && workspace.crmProvider === value && workspace.crmConnected && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      Connected
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </label>
            ))}
          </div>
          {crm === "hubspot" && (
            <Field>
              <FieldLabel htmlFor="crmApiKey">HubSpot private app access token</FieldLabel>
              <Input
                id="crmApiKey"
                name="crmApiKey"
                type="password"
                autoComplete="off"
                placeholder={
                  workspace.crmProvider === "hubspot" && workspace.crmConnected
                    ? "•••••• (unchanged)"
                    : "pat-eu1-…"
                }
              />
              <FieldDescription>
                HubSpot → Settings → Integrations → Private apps. The app needs the
                crm.objects.contacts and crm.objects.notes read/write scopes.
              </FieldDescription>
            </Field>
          )}
          {crm === "pipedrive" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="crmApiKey">Pipedrive API token</FieldLabel>
                <Input
                  id="crmApiKey"
                  name="crmApiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    workspace.crmProvider === "pipedrive" && workspace.crmConnected
                      ? "•••••• (unchanged)"
                      : ""
                  }
                />
                <FieldDescription>
                  Pipedrive → your avatar → Personal preferences → API.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="crmCompanyDomain">Company domain</FieldLabel>
                <div className="flex items-center gap-1 text-sm">
                  <Input
                    id="crmCompanyDomain"
                    name="crmCompanyDomain"
                    defaultValue={workspace.crmCompanyDomain}
                    placeholder="acme"
                    className="max-w-40"
                  />
                  <span className="text-muted-foreground">.pipedrive.com</span>
                </div>
                <FieldDescription>The first part of the address you sign in at.</FieldDescription>
              </Field>
            </div>
          )}
        </fieldset>
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-base font-semibold tracking-tight">Email templates</legend>
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
