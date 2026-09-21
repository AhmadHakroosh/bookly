import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { eq, schema } from "@bookly/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { planName } from "@/server/billing";
import { tenantUrl } from "@/server/platform";
import { getSession } from "@/server/session";

export const metadata = { title: "Your workspaces" };

async function WorkspacesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/workspaces");
  const rows = await db()
    .select({ ws: schema.workspaces, role: schema.members.role })
    .from(schema.members)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.organizationId, schema.members.organizationId),
    )
    .where(eq(schema.members.userId, session.user.id));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
          <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
        </div>
        <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
          New workspace
        </Button>
      </div>
      <ul className="divide-y rounded-xl border">
        {rows.map(({ ws, role }) => (
          <li key={ws.id} className="flex items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-medium">{ws.name}</p>
              <p className="text-muted-foreground">
                {ws.slug} · {role} · {planName(ws.plan)}
                {ws.suspendedAt && (
                  <Badge variant="secondary" className="ml-2">
                    Suspended
                  </Badge>
                )}
              </p>
            </div>
            <a href={tenantUrl(ws.slug)} className="underline underline-offset-4">
              Open →
            </a>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">No workspaces yet.</li>
        )}
      </ul>
    </div>
  );
}

export default function WorkspacesPageBoundary() {
  return (
    <Suspense fallback={null}>
      <WorkspacesPage />
    </Suspense>
  );
}
