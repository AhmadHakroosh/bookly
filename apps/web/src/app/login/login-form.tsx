"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BusyOverlay } from "@/components/busy-overlay";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { dismissed } from "@/lib/passkey-rp";
import type { SocialProvider } from "@/lib/social-providers";
import { OrDivider, SocialButtons } from "@/components/social-buttons";

export function LoginForm({
  next,
  providers,
}: {
  next: string;
  providers: readonly SocialProvider[];
}) {
  const router = useRouter();
  // What is in flight; sign-ins cover the page, sending a link only busies its button.
  const [busy, setBusy] = useState<{ label: string; overlay: boolean } | null>(null);
  const pending = busy !== null;

  // Browsers that support conditional mediation offer saved passkeys in the email field's
  // autofill; picking one signs in without touching the password. Harmless elsewhere.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = await window.PublicKeyCredential?.isConditionalMediationAvailable?.();
      if (!available || cancelled) return;
      const { error } = await authClient.signIn.passkey({ autoFill: true });
      if (cancelled || error) return;
      router.push(next);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  async function onPasskey() {
    await withPending(async () => {
      const { error } = await authClient.signIn.passkey();
      // Closing the browser's prompt is not an error worth reporting.
      if (error)
        return void (!dismissed(error) && toast.error(error.message ?? "No passkey signed in"));
      router.push(next);
      router.refresh();
    });
  }

  async function withPending(fn: () => Promise<void>, label = "Signing in…", overlay = true) {
    setBusy({ label, overlay });
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await withPending(async () => {
      const { error } = await authClient.signIn.email({
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      if (error?.code === "EMAIL_NOT_VERIFIED")
        return void toast.error(
          "Confirm your email address first. We just sent you a new link; open it and you are in.",
        );
      if (error) return void toast.error(error.message ?? "Sign-in failed");
      router.push(next);
      router.refresh();
    });
  }

  async function onMagic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await withPending(
      async () => {
        const { error } = await authClient.signIn.magicLink({
          email: String(f.get("email")),
          callbackURL: next,
        });
        if (error) return void toast.error(error.message ?? "Could not send link");
        toast.success("Check your email for a sign-in link.");
      },
      "Sending link…",
      false,
    );
  }

  return (
    <>
      <BusyOverlay show={!!busy?.overlay} label={busy?.label ?? ""} />
      {providers.length > 0 && (
        <>
          <SocialButtons
            providers={providers}
            callbackURL={next}
            errorCallbackURL={`/login?next=${encodeURIComponent(next)}`}
          />
          <OrDivider />
        </>
      )}
      <Tabs defaultValue="password">
        <TabsList className="w-full">
          <TabsTrigger value="password" className="flex-1">
            Password
          </TabsTrigger>
          <TabsTrigger value="magic" className="flex-1">
            Email link
          </TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <form onSubmit={onPassword} className="mt-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email webauthn"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <p className="-mt-2 text-right text-xs">
                <Link
                  href={`/forgot-password?next=${encodeURIComponent(next)}`}
                  className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Forgot your password?
                </Link>
              </p>
              <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
                {pending && busy?.overlay && <Spinner data-icon="inline-start" />}
                Sign in
              </Button>
            </FieldGroup>
          </form>
        </TabsContent>
        <TabsContent value="magic">
          <form onSubmit={onMagic} className="mt-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="magic-email">Email</FieldLabel>
                <Input id="magic-email" name="email" type="email" autoComplete="email" required />
              </Field>
              <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
                {pending && !busy?.overlay && <Spinner data-icon="inline-start" />}
                {pending && !busy?.overlay ? "Sending link…" : "Send sign-in link"}
              </Button>
            </FieldGroup>
          </form>
        </TabsContent>
      </Tabs>
      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full"
        disabled={pending}
        aria-busy={pending}
        onClick={onPasskey}
      >
        {pending && busy?.overlay && <Spinner data-icon="inline-start" />}
        Sign in with a passkey
      </Button>
    </>
  );
}
