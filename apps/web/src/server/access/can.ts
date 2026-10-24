import type { WorkspaceRole } from "@/lib/roles";

/**
 * What a workspace role may do (ADR 0005), as one closed list of actions. Pure, so the matrix
 * is tested without a database. Opportunity roles (coordinator, reviewer, interviewer, viewer)
 * and their SQL predicates join this module with the hiring schema.
 */
export const ACTIONS = [
  /** Contacts, bookings of others, messages, the drive, tasks, routing forms, Home cards. */
  "client_work.read",
  "client_work.write",
  /** Settings, team, domains, billing, license. */
  "workspace.manage",
  /** Your own profile, schedules, calendars, conferencing and notifications. */
  "own_schedule.manage",
  /** Start an opportunity (hiring.creators: members by default; managers always). */
  "opportunity.create",
  /**
   * Read an applicant's accommodation request. Owners and admins here; an opportunity's
   * coordinators through their team role (server/hiring/sensitive.ts).
   */
  "accommodations.read",
] as const;
export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<WorkspaceRole, ReadonlySet<Action>> = {
  owner: new Set(ACTIONS),
  admin: new Set(ACTIONS),
  member: new Set<Action>([
    "client_work.read",
    "client_work.write",
    "own_schedule.manage",
    "opportunity.create",
  ]),
  collaborator: new Set<Action>(["own_schedule.manage"]),
};

export type ActorRole = { workspaceRole: string | null | undefined };

export function can(actor: ActorRole, action: Action): boolean {
  const allowed = MATRIX[actor.workspaceRole as WorkspaceRole];
  return !!allowed && allowed.has(action);
}

export class AccessError extends Error {
  constructor(public readonly action: Action) {
    super("You don't have access to this.");
  }
}

export function assertCan(actor: ActorRole, action: Action): void {
  if (!can(actor, action)) throw new AccessError(action);
}
