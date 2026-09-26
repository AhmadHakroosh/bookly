import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { configuredSocialProviders, socialErrorMessage } from "@/lib/social-providers";
import { isCloud } from "@/server/platform";
import { getSession } from "@/server/session";
import { SITE } from "@/app/(platform)/platform/site";
import { AcceptForm } from "./accept-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata: Metadata = { title: "Join the team", robots: { index: false } };

async function AcceptPage({ params, searchParams }: PageProps<"/accept-invitation/[id]">) {
  const [{ id }, { error, provider }] = await Promise.all([params, searchParams]);
  const inv = await db().query.invitations.findFirst({ where: eq(schema.invitations.id, id) });
  if (!inv || inv.status !== "pending" || inv.expiresAt < new Date()) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Invitation not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have expired or been cancelled. Ask the workspace owner to send a new one.
        </p>
      </div>
    );
  }
  const session = await getSession();
  if (session && session.user.email.toLowerCase() === inv.email.toLowerCase()) {
    const { auth } = await import("@/lib/auth");
    await auth.api.acceptInvitation({ headers: await headers(), body: { invitationId: id } });
    const ws = await db().query.workspaces.findFirst({
      where: eq(schema.workspaces.organizationId, inv.organizationId),
    });
    if (ws) await (await import("@/server/billing")).syncSeats(ws);
    redirect("/admin/profile?setup=1");
  }
  const org = await db().query.organizations.findFirst({
    where: eq(schema.organizations.id, inv.organizationId),
  });
  // A failed round trip through a provider lands back here with ?error=<code>&provider=<id>.
  const socialError =
    typeof error === "string" && typeof provider === "string"
      ? socialErrorMessage(error, provider, isCloud())
      : null;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Join {org?.name ?? "the team"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You were invited as {inv.email}.{" "}
        {session
          ? "You are signed in with a different account; sign out first."
          : "Create your account to accept."}
      </p>
      {socialError && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 p-3 text-sm">
          {socialError}
        </p>
      )}
      {!session && (
        <AcceptForm
          invitationId={id}
          email={inv.email}
          providers={configuredSocialProviders(loadEnv())}
          consent={isCloud() ? SITE.legalUpdated : null}
        />
      )}
    </div>
  );
}

export default function AcceptPageBoundary(props: PageProps<"/accept-invitation/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AcceptPage {...props} />
    </Suspense>
  );
}
