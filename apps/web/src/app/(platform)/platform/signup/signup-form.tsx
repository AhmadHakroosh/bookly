"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OrDivider, SocialButtons } from "@/components/social-buttons";
import type { SocialProvider } from "@/lib/social-providers";
import { rememberConsentAction } from "@/server/consent-actions";
import { createWorkspace, type CreateState } from "./actions";

/** Two steps on one page: create the account (client, Better Auth), then the workspace (server action). */
export function SignupForm({
  rootDomain,
  signedIn,
  legalVersion,
  providers,
}: {
  rootDomain: string;
  signedIn: boolean;
  /** Date of the terms/privacy revision being accepted, stored with the account. */
  legalVersion: string;
  providers: readonly SocialProvider[];
}) {
  const [step, setStep] = useState<1 | 2>(signedIn ? 2 : 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Both boxes gate the social buttons too: a provider account is created only with consent on record.
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [state, action, creating] = useActionState(createWorkspace, {} as CreateState);
  const [slug, setSlug] = useState("");
  const router = useRouter();
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

  async function createAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await authClient.signUp.email({
      name: String(fd.get("name")),
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      consentAt: new Date(),
      consentVersion: legalVersion,
    });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "Sign-up failed");
    setSlug((s) => s || slugify(String(fd.get("name"))));
    setStep(2);
    router.refresh();
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
          <Field>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                name="terms"
                required
                className="mt-0.5"
                aria-label="I agree to the terms of service"
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="underline underline-offset-4">
                  terms of service
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                name="privacy"
                required
                className="mt-0.5"
                aria-label="I have read the privacy policy and consent to the processing it describes"
                checked={privacy}
                onCheckedChange={(v) => setPrivacy(v === true)}
              />
              <span>
                I have read the{" "}
                <Link href="/privacy" target="_blank" className="underline underline-offset-4">
                  privacy policy
                </Link>{" "}
                and consent to Bookly processing my data as it describes.
              </span>
            </label>
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating account…" : "Continue"}
          </Button>
        </FieldGroup>
        {providers.length > 0 && (
          <>
            <OrDivider />
            <SocialButtons
              providers={providers}
              signUp
              callbackURL="/signup"
              disabled={pending}
              beforeRedirect={async () => {
                if (!terms || !privacy) {
                  setError("Accept the terms of service and privacy policy first.");
                  return false;
                }
                setError(null);
                const { ok } = await rememberConsentAction(legalVersion);
                if (!ok) setError("Could not record your consent. Try again.");
                return ok;
              }}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Signing in with a provider shares your name, email address and profile picture with
              Bookly, nothing else.
            </p>
          </>
        )}
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
