import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { desc, eq, gte, schema, sql } from "@bookly/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { planName } from "@/server/billing";
import { isPlatformAdmin, tenantUrl } from "@/server/platform";
import { getSession } from "@/server/session";
import { impersonateOwner, suspendWorkspace, unsuspendWorkspace } from "./actions";

export const metadata = { title: "Console", robots: { index: false } };

/** Query bundle for the console (kept out of the component so the render stays pure). */
async function loadConsole() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  return Promise.all([
    db()
      .select({
        ws: schema.workspaces,
        ownerEmail: schema.users.email,
        bookings: sql<number>`(select count(*)::int from bookings b where b.workspace_id = ${schema.workspaces.id})`,
      })
      .from(schema.workspaces)
      .leftJoin(
        schema.members,
        sql`${schema.members.organizationId} = ${schema.workspaces.organizationId} and ${schema.members.role} = 'owner'`,
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .orderBy(desc(schema.workspaces.createdAt))
      .limit(200),
    db()
      .select({ plan: schema.workspaces.plan, n: sql<number>`count(*)::int` })
      .from(schema.workspaces)
      .groupBy(schema.workspaces.plan),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(gte(schema.bookings.createdAt, since)),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.users),
  ]);
}

async function ConsolePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/console");
  if (!isPlatformAdmin(session.user.email)) notFound();
  const [workspaces, byPlan, bookings30d, users] = await loadConsole();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operator console</h1>
        <p className="text-sm text-muted-foreground">
          {workspaces.length} workspaces · {users[0]?.n ?? 0} users · {bookings30d[0]?.n ?? 0}{" "}
          bookings in 30 days · {byPlan.map((p) => `${p.n} ${planName(p.plan)}`).join(", ")}
        </p>
      </div>
      <ul className="divide-y rounded-xl border text-sm">
        {workspaces.map(({ ws, ownerEmail, bookings }) => (
          <li key={ws.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">
                {ws.name} <span className="font-mono text-xs text-muted-foreground">{ws.slug}</span>
                {ws.suspendedAt && (
                  <Badge variant="secondary" className="ml-2">
                    Suspended
                  </Badge>
                )}
              </p>
              <p className="text-muted-foreground">
                {ownerEmail ?? "no owner"} · {planName(ws.plan)}
                {ws.planStatus ? ` (${ws.planStatus})` : ""} · {bookings} bookings · since{" "}
                {ws.createdAt.toLocaleDateString()}
                {ws.suspendReason ? ` · ${ws.suspendReason}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={tenantUrl(ws.slug, "/")}
                className="underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
              <form action={impersonateOwner.bind(null, ws.id)}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign in as owner
                </Button>
              </form>
              {ws.suspendedAt ? (
                <form action={unsuspendWorkspace.bind(null, ws.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Unsuspend
                  </Button>
                </form>
              ) : (
                <form action={suspendWorkspace.bind(null, ws.id)} className="flex gap-1">
                  <input
                    name="reason"
                    placeholder="Reason"
                    className="h-7 w-32 rounded-md border bg-background px-2 text-xs"
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    Suspend
                  </Button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ConsolePageBoundary() {
  return (
    <Suspense fallback={null}>
      <ConsolePage />
    </Suspense>
  );
}
