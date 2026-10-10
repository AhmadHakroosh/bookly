"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/action-button";
import { authClient } from "@/lib/auth-client";
import type { SocialProvider, SocialProviderId } from "@/lib/social-providers";

export type LinkedAccount = { providerId: string; accountId: string };

/**
 * Which providers can sign this person in. Connecting sends them through the provider once
 * (its email must match the account's); disconnecting keeps at least one way to sign in.
 */
export function SignInMethods({
  providers,
  linked,
  hasPassword,
  passkeyCount = 0,
  email,
}: {
  providers: readonly SocialProvider[];
  linked: LinkedAccount[];
  hasPassword: boolean;
  /** Registered passkeys; each one is another way in when deciding whether a provider can go. */
  passkeyCount?: number;
  /** The account's email; a provider account must use the same address to be connected. */
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const methods = (hasPassword ? 1 : 0) + linked.length + passkeyCount;

  async function connect(provider: SocialProviderId) {
    setBusy(true);
    const here = new URL(window.location.href);
    here.searchParams.delete("error");
    here.searchParams.delete("provider");
    const errorURL = new URL(here);
    errorURL.searchParams.set("provider", provider);
    const { error } = await authClient.linkSocial({
      provider,
      callbackURL: here.toString(),
      errorCallbackURL: errorURL.toString(),
    });
    setBusy(false);
    if (error) toast.error(error.message ?? "Could not connect");
  }

  async function disconnect(account: LinkedAccount) {
    setBusy(true);
    const { error } = await authClient.unlinkAccount({ accountId: account.accountId });
    setBusy(false);
    if (error) return void toast.error(error.message ?? "Could not disconnect");
    toast.success("Disconnected");
    router.refresh();
  }

  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-base font-semibold tracking-tight">Sign-in methods</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {hasPassword
          ? "Your password works everywhere. Connect a provider to sign in with one click."
          : "You sign in through a provider. Set a password below to have a second way in."}{" "}
        A provider account must use {email}.
      </p>
      <ul className="divide-y">
        {providers.map((p) => {
          const account = linked.find((a) => a.providerId === p.id);
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                {p.label}
                {account && <span className="ml-2 text-xs text-muted-foreground">Connected</span>}
              </span>
              {account ? (
                <ActionButton
                  variant="ghost"
                  size="sm"
                  disabled={busy || methods <= 1}
                  title={methods <= 1 ? "Add another way to sign in first" : undefined}
                  pendingText="Disconnecting…"
                  action={() => disconnect(account)}
                >
                  Disconnect
                </ActionButton>
              ) : (
                <ActionButton
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  pendingText="Redirecting…"
                  action={() => connect(p.id)}
                >
                  Connect
                </ActionButton>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
