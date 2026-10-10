"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ForgotForm({ next }: { next: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(f: FormData) {
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: String(f.get("email")),
      redirectTo: `/reset-password?next=${encodeURIComponent(next)}`,
    });
    if (error) return setError(error.message ?? "Could not send the email");
    setSent(true);
  }

  if (sent)
    return (
      <p className="rounded-lg border p-4 text-sm" role="status">
        If an account exists for that email, a reset link is on its way. It is valid for one hour.
      </p>
    );
  return (
    <form action={request}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <SubmitButton className="w-full" pendingText="Sending…">
          Send reset link
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
