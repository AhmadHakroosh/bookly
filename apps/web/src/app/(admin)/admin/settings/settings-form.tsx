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
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </FieldGroup>
    </form>
  );
}
