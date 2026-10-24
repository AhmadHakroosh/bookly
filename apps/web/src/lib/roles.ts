import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Workspace roles (ADR 0005). Owners and admins run the workspace; members run their own
 * scheduling and see the workspace's client work; collaborators (outside reviewers and
 * interviewers) see only their own profile and schedule, and later the opportunities whose
 * team they are on. Roles are strings in `members.role`.
 */
export const WORKSPACE_ROLES = ["owner", "admin", "member", "collaborator"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** The roles billed as full seats; collaborators are priced on their own (canon X3). */
export const BILLABLE_ROLES: readonly WorkspaceRole[] = ["owner", "admin", "member"];

export const isCollaborator = (role: string | null | undefined) => role === "collaborator";

export const ac = createAccessControl(defaultStatements);

/** Better Auth's organization roles: the defaults, plus collaborator with no org permissions. */
export const orgRoles = {
  owner: ac.newRole({ ...ownerAc.statements }),
  admin: ac.newRole({ ...adminAc.statements }),
  member: ac.newRole({ ...memberAc.statements }),
  collaborator: ac.newRole({ ac: ["read"] }),
};
