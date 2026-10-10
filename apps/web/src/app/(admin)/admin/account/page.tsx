import { AccountSkeleton } from "@/components/skeletons/pages";
import { headers } from "next/headers";
import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { auth } from "@/lib/auth";
import { configuredSocialProviders, socialErrorMessage } from "@/lib/social-providers";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { ownerOf } from "@/server/data-rights";
import { DeleteAccount } from "./delete-account";
import { PasswordForm } from "./password-form";
import { SetPasswordForm } from "./set-password-form";
import { SignInMethods } from "./sign-in-methods";
import { Passkeys } from "./passkeys";

export const metadata = { title: "Account" };

/**
 * Everything about the signed-in person that is not tied to one workspace: how they sign in
 * and the account itself. The per-workspace booking page lives under Scheduling.
 */
async function AccountPage({ searchParams }: PageProps<"/admin/account">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  const h = await headers();
  const [p, accounts, passkeys, owned] = await Promise.all([
    getProfileByUser(ws.id, session.user.id),
    auth.api.listUserAccounts({ headers: h }),
    auth.api.listPasskeys({ headers: h }),
    ownerOf(session.user.id),
  ]);
  const hasPassword = accounts.some((a) => a.providerId === "credential");
  const providers = configuredSocialProviders(loadEnv());
  const linked = accounts
    .filter((a) => a.providerId !== "credential")
    .map((a) => ({ providerId: a.providerId, accountId: a.accountId }));
  // Connecting a provider comes back here with ?error=<code>&provider=<id> when it fails.
  const linkError =
    typeof sp.error === "string" && typeof sp.provider === "string"
      ? socialErrorMessage(sp.error, sp.provider, true)
      : null;
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {session.user.email}. How you sign in applies to every workspace you belong
          to.
        </p>
      </div>
      {linkError && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
          {linkError}
        </p>
      )}
      {(providers.length > 0 || linked.length > 0) && (
        <SignInMethods
          providers={providers}
          linked={linked}
          hasPassword={hasPassword}
          passkeyCount={passkeys.length}
          email={session.user.email}
        />
      )}
      <Passkeys
        passkeys={passkeys.map((k) => ({
          id: k.id,
          name: k.name ?? null,
          createdAt: k.createdAt ? new Date(k.createdAt).toISOString() : null,
        }))}
        timezone={p?.timezone ?? ws.timezone}
        supported
      />
      {hasPassword ? <PasswordForm /> : <SetPasswordForm />}
      <DeleteAccount email={session.user.email} ownsWorkspaces={owned.map((w) => w.name)} />
    </div>
  );
}

export default function AccountPageBoundary(props: PageProps<"/admin/account">) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountPage {...props} />
    </Suspense>
  );
}
