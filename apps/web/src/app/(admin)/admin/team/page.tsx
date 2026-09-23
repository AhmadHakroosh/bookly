import { Suspense } from "react";
import { and, eq, schema } from "@bookly/db";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { listProfiles } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { cancelInvite, removeMember, setRole } from "./actions";
import { InviteForm } from "./invite-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Team" };

async function TeamPage() {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const canManage = role === "owner" || role === "admin";
  const [members, invites, profiles] = await Promise.all([
    db()
      .select({
        id: schema.members.id,
        userId: schema.members.userId,
        role: schema.members.role,
        name: schema.users.name,
        email: schema.users.email,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .where(eq(schema.members.organizationId, ws.organizationId)),
    db()
      .select()
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.organizationId, ws.organizationId),
          eq(schema.invitations.status, "pending"),
        ),
      ),
    listProfiles(ws.id),
  ]);
  const username = new Map(profiles.map((p) => [p.userId, p.username]));
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Each member gets their own booking page, availability and event types. Round-robin and
          collective event types spread bookings across members.
        </p>
      </div>
      {canManage && <InviteForm />}
      <ul className="divide-y rounded-xl border">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-medium">
                {m.name}{" "}
                {m.userId === session.user.id && (
                  <span className="text-muted-foreground">(you)</span>
                )}
              </p>
              <p className="text-muted-foreground">
                {m.email}
                {username.get(m.userId)
                  ? ` · /${username.get(m.userId)}`
                  : " · no booking page yet"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
              {canManage && m.role !== "owner" && m.userId !== session.user.id && (
                <>
                  <form action={setRole.bind(null, m.id, m.role === "admin" ? "member" : "admin")}>
                    <SubmitButton variant="ghost">
                      {m.role === "admin" ? "Make member" : "Make admin"}
                    </SubmitButton>
                  </form>
                  <form action={removeMember.bind(null, m.id)}>
                    <SubmitButton variant="ghost">Remove</SubmitButton>
                  </form>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight">Pending invitations</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 p-3">
                <span>
                  {i.email} · {i.role ?? "member"} · expires {i.expiresAt.toLocaleDateString()}
                </span>
                {canManage && (
                  <form action={cancelInvite.bind(null, i.id)}>
                    <SubmitButton variant="ghost">Cancel</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function TeamPageBoundary() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl">
          <PageSkeleton />
        </div>
      }
    >
      <TeamPage />
    </Suspense>
  );
}
