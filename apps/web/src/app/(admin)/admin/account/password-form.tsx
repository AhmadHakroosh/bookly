"use client";

import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

/** Change the signed-in user's password; other sessions are signed out. */
export function PasswordForm() {
  // A form action (not onSubmit) so the submit button sees it in flight; React resets the
  // fields once it settles.
  async function change(f: FormData) {
    const newPassword = String(f.get("newPassword"));
    if (newPassword !== String(f.get("confirm")))
      return void toast.error("The passwords do not match.");
    const { error } = await authClient.changePassword({
      currentPassword: String(f.get("currentPassword")),
      newPassword,
      revokeOtherSessions: true,
    });
    if (error) return void toast.error(error.message ?? "Could not change the password");
    toast.success("Password changed");
  }

  return (
    <form action={change} className="rounded-xl border p-4">
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
        <SubmitButton pendingText="Saving…">Change password</SubmitButton>
      </FieldGroup>
    </form>
  );
}
