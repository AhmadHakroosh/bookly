import "server-only";
import { and, eq, schema } from "@bookly/db";
import type { OpportunityRole } from "@bookly/db/schema";
import { db } from "@/lib/db";
import {
  assertOnOpportunity,
  assertTeamRoleAllowed,
  HiringAccessError,
  type Actor,
} from "../access";
import { audit } from "../audit";

/*
 * An opportunity's team (ADR 0005). Coordinators (and owners and admins) manage it; a
 * collaborator can be a reviewer, interviewer or viewer but never a coordinator, and the error
 * says to give them a member seat first. Every change is audited.
 */

/** Adds someone to the team or changes their role. */
export async function setTeamRole(
  actor: Actor,
  opportunityId: string,
  userId: string,
  role: OpportunityRole,
): Promise<void> {
  assertOnOpportunity(actor, opportunityId, "opportunity.manage_team");
  const [opp, member] = await Promise.all([
    db().query.opportunities.findFirst({
      where: and(
        eq(schema.opportunities.id, opportunityId),
        eq(schema.opportunities.workspaceId, actor.workspaceId),
      ),
      columns: { id: true, title: true },
    }),
    db()
      .select({ role: schema.members.role })
      .from(schema.members)
      .innerJoin(
        schema.workspaces,
        eq(schema.workspaces.organizationId, schema.members.organizationId),
      )
      .where(and(eq(schema.workspaces.id, actor.workspaceId), eq(schema.members.userId, userId)))
      .then((r) => r[0]),
  ]);
  if (!opp) throw new HiringAccessError("opportunity.manage_team", "That opportunity is gone.");
  if (!member)
    throw new HiringAccessError("opportunity.manage_team", "Invite them to the workspace first.");
  assertTeamRoleAllowed(member.role, role);
  await db()
    .insert(schema.opportunityMembers)
    .values({ workspaceId: actor.workspaceId, opportunityId, userId, role, addedBy: actor.userId })
    .onConflictDoUpdate({
      target: [schema.opportunityMembers.opportunityId, schema.opportunityMembers.userId],
      set: { role },
    });
  await audit({
    workspace: actor.workspaceId,
    action: "opportunity.team_role_set",
    target: { type: "opportunity", id: opp.id, label: opp.title },
    changes: { userId: { to: userId }, role: { to: role } },
  });
}

/** Takes someone off the team. An opportunity always keeps one coordinator. */
export async function removeFromTeam(
  actor: Actor,
  opportunityId: string,
  userId: string,
): Promise<void> {
  assertOnOpportunity(actor, opportunityId, "opportunity.manage_team");
  const team = await db()
    .select({ userId: schema.opportunityMembers.userId, role: schema.opportunityMembers.role })
    .from(schema.opportunityMembers)
    .where(
      and(
        eq(schema.opportunityMembers.opportunityId, opportunityId),
        eq(schema.opportunityMembers.workspaceId, actor.workspaceId),
      ),
    );
  const leaving = team.find((m) => m.userId === userId);
  if (!leaving) return;
  if (leaving.role === "coordinator" && team.filter((m) => m.role === "coordinator").length === 1)
    throw new HiringAccessError(
      "opportunity.manage_team",
      "Name another coordinator before removing the last one.",
    );
  await db()
    .delete(schema.opportunityMembers)
    .where(
      and(
        eq(schema.opportunityMembers.opportunityId, opportunityId),
        eq(schema.opportunityMembers.userId, userId),
      ),
    );
  await audit({
    workspace: actor.workspaceId,
    action: "opportunity.team_member_removed",
    target: { type: "opportunity", id: opportunityId },
    changes: { userId: { from: userId } },
  });
}
