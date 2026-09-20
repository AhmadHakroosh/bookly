"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
        </Field>
        <Field>
          <FieldLabel htmlFor="bio">Bio</FieldLabel>
          <Textarea id="bio" name="bio" rows={2} defaultValue={initial.bio} />
        </Field>
        <Field>
          <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
          <select
            id="timezone"
            name="timezone"
            defaultValue={initial.timezone}
            className="h-8 rounded-lg border bg-background px-2 text-sm"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="avatarUrl">Avatar URL</FieldLabel>
          <Input
            id="avatarUrl"
            name="avatarUrl"
            defaultValue={initial.avatarUrl}
            placeholder="https://…"
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </FieldGroup>
    </form>
  );
}
