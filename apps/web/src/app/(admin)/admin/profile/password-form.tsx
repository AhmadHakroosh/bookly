"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

/** Change the signed-in user's password; other sessions are signed out. */
export function PasswordForm() {
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const newPassword = String(f.get("newPassword"));
    if (newPassword !== String(f.get("confirm")))
      return void toast.error("The passwords do not match.");
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(f.get("currentPassword")),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) return void toast.error(error.message ?? "Could not change the password");
    toast.success("Password changed");
    form.reset();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md rounded-xl border p-4">
      <h2 className="text-base font-semibold tracking-tight">Password</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Changing it signs you out everywhere else. Forgot it? Sign out and use &ldquo;Forgot your
        password?&rdquo; on the sign-in page.
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
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
          <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
