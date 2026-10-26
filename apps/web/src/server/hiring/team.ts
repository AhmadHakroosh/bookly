import "server-only";
import { and, eq, inArray, schema } from "@bookly/db";
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
  if (role !== "coordinator") {
    const coordinators = await db()
      .select({ userId: schema.opportunityMembers.userId })
      .from(schema.opportunityMembers)
      .where(
        and(
          eq(schema.opportunityMembers.opportunityId, opportunityId),
          eq(schema.opportunityMembers.role, "coordinator"),
        ),
      );
    if (coordinators.length === 1 && coordinators[0]!.userId === userId)
      throw new HiringAccessError(
        "opportunity.manage_team",
        "Name another coordinator before changing the last one's role.",
      );
  }
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
  // Leaving the team ends every grant it gave: per-application access and reviews still owed.
  const apps = db()
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(eq(schema.applications.opportunityId, opportunityId));
  await db().transaction(async (tx) => {
    await tx
      .delete(schema.opportunityMembers)
      .where(
        and(
          eq(schema.opportunityMembers.opportunityId, opportunityId),
          eq(schema.opportunityMembers.userId, userId),
        ),
      );
    await tx
      .delete(schema.applicationAccess)
      .where(
        and(
          eq(schema.applicationAccess.userId, userId),
          inArray(schema.applicationAccess.applicationId, apps),
        ),
      );
    await tx
      .delete(schema.reviewAssignments)
      .where(
        and(
          eq(schema.reviewAssignments.reviewerUserId, userId),
          eq(schema.reviewAssignments.status, "pending"),
          inArray(schema.reviewAssignments.applicationId, apps),
        ),
      );
  });
  await audit({
    workspace: actor.workspaceId,
    action: "opportunity.team_member_removed",
    target: { type: "opportunity", id: opportunityId },
    changes: { userId: { from: userId } },
  });
}

/**
 * Someone left the workspace: every hiring grant they held there goes with them (team roles,
 * per-application access, reviews still owed). Submitted reviews stay, attributed.
 */
export async function purgeHiringAccess(workspaceId: string, userId: string): Promise<void> {
  await db().transaction(async (tx) => {
    await tx
      .delete(schema.opportunityMembers)
      .where(
        and(
          eq(schema.opportunityMembers.workspaceId, workspaceId),
          eq(schema.opportunityMembers.userId, userId),
        ),
      );
    await tx
      .delete(schema.applicationAccess)
      .where(
        and(
          eq(schema.applicationAccess.workspaceId, workspaceId),
          eq(schema.applicationAccess.userId, userId),
        ),
      );
    await tx
      .delete(schema.reviewAssignments)
      .where(
        and(
          eq(schema.reviewAssignments.workspaceId, workspaceId),
          eq(schema.reviewAssignments.reviewerUserId, userId),
          eq(schema.reviewAssignments.status, "pending"),
        ),
      );
  });
}

/** Whether someone is on any opportunity's team here: that alone opens Hiring (ADR 0009 §3). */
export async function onAnyOpportunityTeam(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: schema.opportunityMembers.opportunityId })
    .from(schema.opportunityMembers)
    .where(
      and(
        eq(schema.opportunityMembers.workspaceId, workspaceId),
        eq(schema.opportunityMembers.userId, userId),
      ),
    )
    .limit(1);
  return !!row;
}
