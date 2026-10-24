import "server-only";
import { cache } from "react";
import { and, eq, schema } from "@bookly/db";
import type { WorkspaceRole } from "@/lib/roles";
import { db } from "@/lib/db";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** Opportunity team roles (ADR 0005), from opportunity_members. */
export type { OpportunityRole } from "@bookly/db/schema";
import type { OpportunityRole } from "@bookly/db/schema";

/** Who is asking, resolved once per request. Every hiring read takes one as its first argument. */
export type Actor = {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  opportunityRoles: ReadonlyMap<string, OpportunityRole>;
};

export const getActor = cache(async (): Promise<Actor | null> => {
  const [session, ws, role] = await Promise.all([
    getSession(),
    getCurrentWorkspace(),
    getStaffRole(),
  ]);
  if (!session || !ws || !role) return null;
  const teams = await db()
    .select({
      opportunityId: schema.opportunityMembers.opportunityId,
      role: schema.opportunityMembers.role,
    })
    .from(schema.opportunityMembers)
    .where(
      and(
        eq(schema.opportunityMembers.workspaceId, ws.id),
        eq(schema.opportunityMembers.userId, session.user.id),
      ),
    );
  return {
    userId: session.user.id,
    workspaceId: ws.id,
    workspaceRole: role as WorkspaceRole,
    opportunityRoles: new Map(teams.map((t) => [t.opportunityId, t.role])),
  };
});
