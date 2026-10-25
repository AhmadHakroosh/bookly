import { TeamSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { and, eq, schema } from "@bookly/db";
import { isCloud } from "@/server/platform";
import { TeamBillingNav } from "./team-billing-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { StatusChip } from "@/components/ui/status-chip";
import { UsageBar } from "@/components/ui/usage-bar";
import { workspaceLimits } from "@/server/limits";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { listProfiles } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { cancelInvite, removeMember, setRole } from "./actions";
import { hasFlag } from "@/server/flags";
import { InviteForm } from "./invite-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Team" };

async function TeamPage({ searchParams }: PageProps<"/admin/team">) {
  const sp = await searchParams;
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
  const seats = members.filter((m) => m.role !== "collaborator").length;
  const maxSeats = workspaceLimits(ws).members;
  const ROLE: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
    collaborator: "Collaborator",
  };
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title={isCloud() ? "Team & billing" : "Team"}
        description={
          <>
            Each member gets their own booking page, availability and event types. Round-robin and
            collective event types spread bookings across members.
          </>
        }
      >
        {canManage && isCloud() && <TeamBillingNav current="team" />}
      </PageHeader>
      {sp.invited === "1" && (
        <p className="rounded-xl border bg-card p-3 text-sm">Invitation sent.</p>
      )}
      {typeof sp.error === "string" && sp.error && (
        <p className="rounded-xl border border-destructive/40 bg-card p-3 text-sm">{sp.error}</p>
      )}
      {canManage && (
        <section aria-labelledby="invite-title" className="rounded-xl border bg-card p-5">
          <h2 id="invite-title" className="mb-3 text-base font-semibold tracking-tight">
            Invite member
          </h2>
          <InviteForm collaborators={await hasFlag(ws, "hiring")} />
        </section>
      )}
      <section aria-labelledby="members-title" className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <h2 id="members-title" className="text-base font-semibold tracking-tight">
            Team members ({members.length})
          </h2>
          {maxSeats !== null && (
            <UsageBar label="Seat usage" used={seats} limit={maxSeats} className="w-56" />
          )}
        </div>
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <Avatar size="lg" aria-hidden>
                <AvatarFallback>{initialsOf(m.name || m.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {m.name}
                  {m.userId === session.user.id && <StatusChip tone="info">You</StatusChip>}
                </p>
                <p className="truncate text-muted-foreground">
                  {m.email}
                  {username.get(m.userId)
                    ? ` · /${username.get(m.userId)}`
                    : " · no booking page yet"}
                </p>
              </div>
              <StatusChip tone={m.role === "owner" ? "accent" : "neutral"}>
                {ROLE[m.role] ?? m.role}
              </StatusChip>
              {canManage &&
                m.role !== "owner" &&
                m.role !== "collaborator" &&
                m.userId !== session.user.id && (
                  <div className="flex items-center gap-1">
                    <form
                      action={setRole.bind(null, m.id, m.role === "admin" ? "member" : "admin")}
                    >
                      <SubmitButton variant="ghost" size="sm">
                        {m.role === "admin" ? "Make member" : "Make admin"}
                      </SubmitButton>
                    </form>
                    <form action={removeMember.bind(null, m.id)}>
                      <SubmitButton variant="ghost" size="sm">
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                )}
            </li>
          ))}
        </ul>
      </section>
      {invites.length > 0 && (
        <section aria-labelledby="pending-title" className="rounded-xl border bg-card">
          <h2
            id="pending-title"
            className="border-b px-5 py-3 text-base font-semibold tracking-tight"
          >
            Pending invitations ({invites.length})
          </h2>
          <ul className="divide-y text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar size="lg" aria-hidden>
                  <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">
                    {initialsOf(i.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.email}</span>
                  <span className="block text-muted-foreground">
                    Invited as {ROLE[i.role ?? "member"]?.toLowerCase() ?? i.role} · expires{" "}
                    {i.expiresAt.toLocaleDateString()}
                  </span>
                </span>
                {canManage && (
                  <form action={cancelInvite.bind(null, i.id)}>
                    <SubmitButton variant="ghost" size="sm">
                      Cancel
                    </SubmitButton>
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

export default function TeamPageBoundary(props: PageProps<"/admin/team">) {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamPage {...props} />
    </Suspense>
  );
}
