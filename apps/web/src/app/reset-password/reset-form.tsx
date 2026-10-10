"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ResetForm({ token, next }: { token: string; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function reset(f: FormData) {
    const password = String(f.get("password"));
    if (password !== String(f.get("confirm"))) return setError("The passwords do not match.");
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) return setError(error.message ?? "This link is no longer valid.");
    toast.success("Password updated. Sign in with your new password.");
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <form action={reset}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            name="password"
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
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <SubmitButton className="w-full" pendingText="Saving…">
          Set new password
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
