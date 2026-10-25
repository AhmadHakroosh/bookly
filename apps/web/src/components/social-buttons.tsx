"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { SignInMark } from "@/components/brand-icons";
import type { SocialProvider, SocialProviderId } from "@/lib/social-providers";

/**
 * One labelled, full-width button per configured provider ("Continue with Google", "Sign in with
 * Microsoft", "Continue with GitHub"), each provider's mark as its vendor requires it
 * (planning/v2/ux/visual-alignment.md §1.3). The page decides what happens after
 * the round trip through the provider (`callbackURL`) and whether a new account may be created
 * (`signUp`); errors come back on `errorCallbackURL` as `?error=<code>&provider=<id>`.
 */
export function SocialButtons({
  providers,
  callbackURL,
  errorCallbackURL = callbackURL,
  signUp = false,
  disabled = false,
  beforeRedirect,
}: {
  providers: readonly SocialProvider[];
  /** Where to land after signing in (absolute or site-relative; resolved against the current origin). */
  callbackURL: string;
  errorCallbackURL?: string;
  /** Allow the provider identity to create a new account (sign-up and invitation pages). */
  signUp?: boolean;
  disabled?: boolean;
  /** Runs before leaving for the provider, e.g. to record consent. Returning false cancels. */
  beforeRedirect?: (provider: SocialProviderId) => Promise<boolean> | boolean;
}) {
  const [busy, setBusy] = useState<SocialProviderId | null>(null);
  if (providers.length === 0) return null;

  async function go(provider: SocialProviderId) {
    setBusy(provider);
    try {
      if (beforeRedirect && !(await beforeRedirect(provider))) return;
      const origin = window.location.origin;
      const absolute = (u: string) => new URL(u, origin).toString();
      const withProvider = (u: string) => {
        const url = new URL(u, origin);
        url.searchParams.set("provider", provider);
        return url.toString();
      };
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: absolute(callbackURL),
        errorCallbackURL: withProvider(errorCallbackURL),
        requestSignUp: signUp,
      });
      if (error) toast.error(error.message ?? "Could not start sign-in");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="grid gap-2"
      role="group"
      aria-label="Continue with a provider"
      data-testid="social-buttons"
    >
      {providers.map((p) => {
        // Microsoft's guidance names the button "Sign in with Microsoft".
        const verb = p.id === "microsoft" ? "Sign in with" : "Continue with";
        const label = busy === p.id ? `Redirecting to ${p.label}…` : `${verb} ${p.label}`;
        return (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            className="h-10 w-full"
            disabled={disabled || busy !== null}
            onClick={() => go(p.id)}
          >
            {busy === p.id ? (
              <Loader2 className="size-5 animate-spin" data-icon="inline-start" aria-hidden />
            ) : (
              <SignInMark id={p.id} className="size-5" data-icon="inline-start" />
            )}
            {label}
          </Button>
        );
      })}
    </div>
  );
}

/** "or" rule between the social buttons and the email forms. */
export function OrDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
