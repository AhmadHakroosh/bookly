"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setPasswordAction, type AccountState } from "./account-actions";

/** For accounts created through a provider: adds a password as a second way to sign in. */
export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPasswordAction, {} as AccountState);
  return (
    <form action={action} className="rounded-xl border p-4">
      <h2 className="text-base font-semibold tracking-tight">Password</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Your account has no password yet. Setting one lets you sign in without the provider.
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            minLength={10}
            autoComplete="new-password"
            required
          />
          <FieldDescription>At least 10 characters.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.ok && <p className="text-sm text-muted-foreground">Password set.</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Set password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
