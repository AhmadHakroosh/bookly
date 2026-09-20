"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneField } from "@/components/timezone-field";
import { saveProfile } from "../scheduling-actions";

type Values = {
  username: string;
  displayName: string;
  bio: string;
  timezone: string;
  avatarUrl: string;
};

export function ProfileForm({ initial, zones }: { initial: Values; zones: string[] }) {
  const [state, action, pending] = useActionState(
    saveProfile,
    {} as { ok?: boolean; error?: string },
  );
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input id="username" name="username" defaultValue={initial.username} required />
          <FieldDescription>Your page lives at /{initial.username || "username"}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="displayName">Display name</FieldLabel>
          <Input id="displayName" name="displayName" defaultValue={initial.displayName} required />
          <FieldDescription>Shown as the host on your page and in emails.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="bio">Bio</FieldLabel>
          <Textarea id="bio" name="bio" rows={2} defaultValue={initial.bio} />
          <FieldDescription>
            One or two sentences under your name on the booking page.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="timezone">Your timezone</FieldLabel>
          <TimezoneField name="timezone" defaultValue={initial.timezone} zones={zones} />
          <FieldDescription>
            Where you are. Visitors see times in their own timezone automatically.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="avatarUrl">Avatar URL</FieldLabel>
          <Input
            id="avatarUrl"
            name="avatarUrl"
            defaultValue={initial.avatarUrl}
            placeholder="https://…"
          />
          <FieldDescription>Link to a square image, ideally at least 256×256.</FieldDescription>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </FieldGroup>
    </form>
  );
}
