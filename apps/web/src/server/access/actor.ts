import "server-only";
import { cache } from "react";
import type { WorkspaceRole } from "@/lib/roles";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** Opportunity team roles (ADR 0005); filled from opportunity_members with the hiring schema. */
export type OpportunityRole = "coordinator" | "reviewer" | "interviewer" | "viewer";

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
  return {
    userId: session.user.id,
    workspaceId: ws.id,
    workspaceRole: role as WorkspaceRole,
    opportunityRoles: new Map(),
  };
});
