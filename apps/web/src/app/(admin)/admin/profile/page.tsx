import { headers } from "next/headers";
import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { auth } from "@/lib/auth";
import { configuredSocialProviders, socialErrorMessage } from "@/lib/social-providers";
import { timezoneList } from "@/lib/time";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { ownerOf } from "@/server/data-rights";
import { DeleteAccount } from "./delete-account";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { SetPasswordForm } from "./set-password-form";
import { SignInMethods } from "./sign-in-methods";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Booking page" };

async function ProfilePage({ searchParams }: PageProps<"/admin/profile">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  const [p, accounts] = await Promise.all([
    getProfileByUser(ws.id, session.user.id),
    auth.api.listUserAccounts({ headers: await headers() }),
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
  const suggested = session.user.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your booking page</h1>
        <p className="text-sm text-muted-foreground">
          {sp.setup === "1"
            ? "Set up your public page first, then create event types."
            : "Public profile shown at /<username>."}
        </p>
      </div>
      <ProfileForm
        initial={{
          username: p?.username ?? suggested,
          displayName: p?.displayName ?? session.user.name,
          bio: p?.bio ?? "",
          timezone: p?.timezone ?? ws.timezone,
          avatarUrl: p?.avatarUrl ?? session.user.image ?? "",
        }}
        zones={timezoneList()}
      />
      {linkError && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
          {linkError}
        </p>
      )}
      {(providers.length > 0 || linked.length > 0) && (
        <SignInMethods providers={providers} linked={linked} hasPassword={hasPassword} />
      )}
      {hasPassword ? <PasswordForm /> : <SetPasswordForm />}
      <DeleteAccount
        email={session.user.email}
        ownsWorkspaces={(await ownerOf(session.user.id)).map((w) => w.name)}
      />
    </div>
  );
}

export default function ProfilePageBoundary(props: PageProps<"/admin/profile">) {
  return (
    <Suspense
      fallback={
        <div className="max-w-xl">
          <PageSkeleton />
        </div>
      }
    >
      <ProfilePage {...props} />
    </Suspense>
  );
}
