import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/links";
import { planName } from "@/server/billing";
import { listUserWorkspaces } from "@/server/platform";
import { getSession } from "@/server/session";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Your workspaces" };

async function WorkspacesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/workspaces");
  const rows = await listUserWorkspaces(session.user.id);
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-14 md:py-20">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
          <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
        </div>
        <Button nativeButton={false} render={<Link href="/signup" />}>
          New workspace
        </Button>
      </div>
      <ul className="divide-y rounded-xl border">
        {rows.map((ws) => (
          <li key={ws.id} className="flex items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-medium">{ws.name}</p>
              <p className="text-muted-foreground">
                {ws.slug} · {ws.role} · {planName(ws.plan)}
                {ws.suspended && (
                  <Badge variant="secondary" className="ml-2">
                    Suspended
                  </Badge>
                )}
              </p>
            </div>
            <ExternalLink
              href={ws.url}
              className="inline-flex shrink-0 items-center gap-1 underline underline-offset-4"
            >
              Open
            </ExternalLink>
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
    <Suspense fallback={<PageSkeleton />}>
      <WorkspacesPage />
    </Suspense>
  );
}
