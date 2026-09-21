"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AcceptForm({ invitationId, email }: { invitationId: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await authClient.signUp.email({
      name: String(fd.get("name")),
      email,
      password: String(fd.get("password")),
    });
    if (res.error) {
      setError(res.error.message ?? "Sign-up failed");
      setPending(false);
      return;
    }
    const acc = await authClient.organization.acceptInvitation({ invitationId });
    if (acc.error) {
      setError(acc.error.message ?? "Could not accept the invitation");
      setPending(false);
      return;
    }
    router.push("/admin/profile?setup=1");
  }
  return (
    <form onSubmit={onSubmit} className="mt-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" value={email} disabled />
        </Field>
        <Field>
          <FieldLabel htmlFor="name">Your name</FieldLabel>
          <Input id="name" name="name" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" minLength={10} required />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account and join"}
        </Button>
      </FieldGroup>
    </form>
  );
}
