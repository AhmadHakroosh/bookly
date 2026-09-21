"use client";

import { useActionState, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createWorkspace, type CreateState } from "./actions";

/** Two steps on one page: create the account (client, Better Auth), then the workspace (server action). */
export function SignupForm({ rootDomain, signedIn }: { rootDomain: string; signedIn: boolean }) {
  const [step, setStep] = useState<1 | 2>(signedIn ? 2 : 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [state, action, creating] = useActionState(createWorkspace, {} as CreateState);
  const [slug, setSlug] = useState("");

  async function createAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await authClient.signUp.email({
      name: String(fd.get("name")),
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "Sign-up failed");
    setStep(2);
  }

  if (step === 1)
    return (
      <form onSubmit={createAccount}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input id="name" name="name" required autoComplete="name" />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
            />
            <FieldDescription>At least 10 characters.</FieldDescription>
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating account…" : "Continue"}
          </Button>
        </FieldGroup>
      </form>
    );

  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="wsname">Workspace name</FieldLabel>
          <Input
            id="wsname"
            name="name"
            required
            placeholder="Jane Doe"
            onChange={(e) =>
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "")
                  .slice(0, 40),
              )
            }
          />
          <FieldDescription>Shown to people who book with you.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="slug">Address</FieldLabel>
          <div className="flex items-center gap-1 text-sm">
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="max-w-48"
            />
            <span className="text-muted-foreground">.{rootDomain}</span>
          </div>
          <FieldDescription>You can add your own domain later.</FieldDescription>
        </Field>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={creating}>
          {creating ? "Creating workspace…" : "Create workspace"}
        </Button>
      </FieldGroup>
    </form>
  );
}
