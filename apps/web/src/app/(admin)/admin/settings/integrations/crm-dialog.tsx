"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { updateWorkspaceSettings, type SettingsState } from "../actions";

type Crm = "hubspot" | "pipedrive";
const NAME: Record<Crm, string> = { hubspot: "HubSpot", pipedrive: "Pipedrive" };

/**
 * Connect or manage one CRM from its row (`mocks.png` 08): the token (stored encrypted), and for
 * Pipedrive the company domain. Bookly mirrors to one CRM at a time, so connecting one replaces
 * the other; Disconnect stops the sync.
 */
export function CrmDialog({
  provider,
  connected,
  other,
  companyDomain,
}: {
  provider: Crm;
  connected: boolean;
  /** The other CRM is the one connected now. */
  other: boolean;
  companyDomain: string;
}) {
  const [open, setOpen] = useState(false);
  // Closes from the action itself, so a save never sets state from an effect.
  const [, action] = useActionState(async (prev: SettingsState, form: FormData) => {
    const r = await updateWorkspaceSettings(prev, form);
    if (r.ok) {
      toast.success("CRM settings saved");
      setOpen(false);
    } else if (r.error) toast.error(r.error);
    return r;
  }, {} as SettingsState);
  const name = NAME[provider];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        {connected ? "Manage" : "Connect"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{connected ? name : `Connect ${name}`}</DialogTitle>
          <DialogDescription>
            Contacts, stage changes, meeting notes and sent emails are mirrored to {name}.
            {other &&
              ` This replaces the ${provider === "hubspot" ? "Pipedrive" : "HubSpot"} sync.`}
          </DialogDescription>
        </DialogHeader>
        <form action={action} id={`crm-${provider}`}>
          <input type="hidden" name="section" value="integrations" />
          <input type="hidden" name="crmProvider" value={provider} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`crm-key-${provider}`}>
                {provider === "hubspot" ? "Private app access token" : "API token"}
              </FieldLabel>
              <Input
                id={`crm-key-${provider}`}
                name="crmApiKey"
                type="password"
                autoComplete="off"
                placeholder={
                  connected ? "•••••• (unchanged)" : provider === "hubspot" ? "pat-eu1-…" : ""
                }
              />
              <FieldDescription>
                {provider === "hubspot"
                  ? "HubSpot → Settings → Integrations → Private apps, with the crm.objects.contacts and crm.objects.notes read/write scopes."
                  : "Pipedrive → your avatar → Personal preferences → API."}
              </FieldDescription>
            </Field>
            {provider === "pipedrive" && (
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
              </Field>
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          {connected && (
            <form action={action} className="me-auto">
              <input type="hidden" name="section" value="integrations" />
              <input type="hidden" name="crmProvider" value="" />
              <SubmitButton variant="ghost" className="text-destructive">
                Disconnect
              </SubmitButton>
            </form>
          )}
          <SubmitButton form={`crm-${provider}`} pendingText="Saving…">
            {connected ? "Save" : "Connect"}
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
