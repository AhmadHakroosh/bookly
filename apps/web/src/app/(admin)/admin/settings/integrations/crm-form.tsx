"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateWorkspaceSettings, type SettingsState } from "../actions";

type Provider = "" | "hubspot" | "pipedrive";

export function CrmForm({
  provider,
  connected,
  companyDomain,
}: {
  provider: Provider;
  connected: boolean;
  companyDomain: string;
}) {
  const [state, action, pending] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  const [crm, setCrm] = useState<Provider>(provider);
  useEffect(() => {
    if (state.ok) toast.success("CRM settings saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="section" value="integrations" />
      <FieldGroup>
        <FieldDescription>
          Mirror contacts, stage changes, meeting notes and sent emails to the CRM your team already
          uses. Pick one; the token is stored encrypted.
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
                {value && provider === value && connected && (
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
              placeholder={provider === "hubspot" && connected ? "•••••• (unchanged)" : "pat-eu1-…"}
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
                placeholder={provider === "pipedrive" && connected ? "•••••• (unchanged)" : ""}
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
                  defaultValue={companyDomain}
                  placeholder="acme"
                  className="max-w-40"
                />
                <span className="text-muted-foreground">.pipedrive.com</span>
              </div>
              <FieldDescription>The first part of the address you sign in at.</FieldDescription>
            </Field>
          </div>
        )}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
