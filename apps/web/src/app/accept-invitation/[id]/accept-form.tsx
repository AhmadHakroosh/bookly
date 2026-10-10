"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { BusyOverlay } from "@/components/busy-overlay";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OrDivider, SocialButtons } from "@/components/social-buttons";
import type { SocialProvider } from "@/lib/social-providers";
import { rememberConsentAction } from "@/server/consent-actions";

export function AcceptForm({
  invitationId,
  email,
  providers,
  consent,
  next,
}: {
  invitationId: string;
  email: string;
  /** Where to land once the invitation is accepted (the workspace's admin, on its own host). */
  next: string;
  providers: readonly SocialProvider[];
  /** Cloud: the legal revision the person must accept (null on a self-hosted install). */
  consent: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const acceptPath = `/accept-invitation/${invitationId}`;
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await authClient.signUp.email({
      name: String(fd.get("name")),
      email,
      password: String(fd.get("password")),
      ...(consent ? { consentAt: new Date(), consentVersion: consent } : {}),
    });
    if (res.error) {
      setError(res.error.message ?? "Sign-up failed");
      setPending(false);
      return;
    }
    // Cloud requires a verified address before a password sign-in, so sign-up hands back no
    // session; invitees are marked verified on creation (the invitation proved the address),
    // and signing in with the same credentials gets the session the acceptance needs.
    if (!res.data?.token) {
      const login = await authClient.signIn.email({ email, password: String(fd.get("password")) });
      if (login.error) {
        setError(login.error.message ?? "Could not sign in");
        setPending(false);
        return;
      }
    }
    const acc = await authClient.organization.acceptInvitation({ invitationId });
    if (acc.error) {
      setError(acc.error.message ?? "Could not accept the invitation");
      setPending(false);
      return;
    }
    window.location.assign(next);
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
        {consent && (
          <Field>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                name="consent"
                required
                className="mt-0.5"
                aria-label="I agree to the terms of service and privacy policy"
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="underline underline-offset-4">
                  terms of service
                </Link>{" "}
                and have read the{" "}
                <Link href="/privacy" target="_blank" className="underline underline-offset-4">
                  privacy policy
                </Link>
                .
              </span>
            </label>
          </Field>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Creating account…" : "Create account and join"}
        </Button>
        <BusyOverlay show={pending} label="Creating your account and joining the workspace…" />
      </FieldGroup>
      {providers.length > 0 && (
        <>
          <OrDivider />
          <p className="mb-3 text-xs text-muted-foreground">
            The provider account must use {email}.
          </p>
          <SocialButtons
            providers={providers}
            signUp
            callbackURL={acceptPath}
            disabled={pending}
            beforeRedirect={async () => {
              if (!consent) return true;
              if (!accepted) {
                setError("Accept the terms of service and privacy policy first.");
                return false;
              }
              setError(null);
              const { ok } = await rememberConsentAction(consent);
              if (!ok) setError("Could not record your consent. Try again.");
              return ok;
            }}
          />
        </>
      )}
    </form>
  );
}
