import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { getSession } from "@/server/session";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Join the team", robots: { index: false } };

async function AcceptPage({ params }: PageProps<"/accept-invitation/[id]">) {
  const { id } = await params;
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
    redirect("/admin/profile?setup=1");
  }
  const org = await db().query.organizations.findFirst({
    where: eq(schema.organizations.id, inv.organizationId),
  });
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Join {org?.name ?? "the team"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You were invited as {inv.email}.{" "}
        {session
          ? "You are signed in with a different account; sign out first."
          : "Create your account to accept."}
      </p>
      {!session && <AcceptForm invitationId={id} email={inv.email} />}
    </div>
  );
}

export default function AcceptPageBoundary(props: PageProps<"/accept-invitation/[id]">) {
  return (
    <Suspense fallback={null}>
      <AcceptPage {...props} />
    </Suspense>
  );
}
