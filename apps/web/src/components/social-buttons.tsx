"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import type { SocialProvider, SocialProviderId } from "@/lib/social-providers";

function Icon({ id }: { id: SocialProviderId }) {
  if (id === "google")
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="size-4">
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.2v3.1C3.2 21.3 7.3 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.3 14.3c-.5-1.5-.5-3.1 0-4.6V6.6H1.2c-1.6 3.3-1.6 7.2 0 10.8l4.1-3.1z"
        />
        <path
          fill="#EA4335"
          d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.6l4.1 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
        />
      </svg>
    );
  if (id === "microsoft")
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="size-4">
        <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
        <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
        <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
        <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z" />
    </svg>
  );
}

/**
 * "Continue with …" buttons for the configured providers. The page decides what happens after
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
    <div className="grid gap-2" data-testid="social-buttons">
      {providers.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="outline"
          className="w-full"
          disabled={disabled || busy !== null}
          onClick={() => go(p.id)}
        >
          <Icon id={p.id} />
          {busy === p.id ? "Redirecting…" : `Continue with ${p.label}`}
        </Button>
      ))}
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
