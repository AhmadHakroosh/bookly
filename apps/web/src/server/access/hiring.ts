import { schema, sql, type SQL } from "@bookly/db";
import type { OpportunityRole } from "@bookly/db/schema";
import type { Actor } from "./actor";

/** Owners and admins (kept here, not imported from the session module, so this file stays pure). */
const isManager = (role: string) => role === "owner" || role === "admin";

/*
 * Who may see and do what in hiring (ADR 0005). Reads are SQL predicates, so the filter runs in
 * the same statement as the query; writes are checks that throw. Everything is deny by default:
 * code that has no actor (AI context, exports, the API, emails) sees no application, no
 * hiring timeline entry, no interview and no contact who exists only as a candidate.
 *
 * Visibility of one application, for user U:
 * - an owner or admin of the workspace (they act as coordinators everywhere);
 * - a coordinator or viewer on its opportunity's team;
 * - a reviewer on the team when the opportunity is open to the whole team
 *   (`assignedReviewersOnly` off; it is on by default);
 * - anyone with an `application_access` row for it (a review assignment, an interview, a share).
 */

const a = schema.applications;

/** Any user's view of one application row (`app` is the applications table or an alias). */
export function canSeeApplication(userId: string, app: typeof a = a): SQL {
  return sql`(
    exists (
      select 1 from ${schema.members} m
      join ${schema.workspaces} w on w.organization_id = m.organization_id
      where w.id = ${app.workspaceId} and m.user_id = ${userId} and m.role in ('owner', 'admin')
    )
    or exists (
      select 1 from ${schema.opportunityMembers} om
      where om.opportunity_id = ${app.opportunityId} and om.user_id = ${userId}
        and (
          om.role in ('coordinator', 'viewer')
          or (om.role = 'reviewer' and exists (
            select 1 from ${schema.opportunities} o
            where o.id = ${app.opportunityId}
              and coalesce((o.settings ->> 'assignedReviewersOnly')::boolean, true) = false
          ))
        )
    )
    or exists (
      select 1 from ${schema.applicationAccess} aa
      where aa.application_id = ${app.id} and aa.user_id = ${userId}
    )
  )`;
}

/** Applications this actor may see, as a where-clause; always within the actor's workspace. */
export function applicationsVisibleTo(actor: Actor): SQL {
  const ws = sql`${a.workspaceId} = ${actor.workspaceId}`;
  return isManager(actor.workspaceRole) ? ws : sql`(${ws} and ${canSeeApplication(actor.userId)})`;
}

/**
 * Contacts a user may see: everyone except people who exist only as candidates (no client stage,
 * at least one application), who show only to people who can see one of their applications.
 * Without a user (`null`): candidates are never shown.
 */
export function contactsVisibleTo(userId: string | null): SQL {
  const c = schema.contacts;
  const candidateOnly = sql`(${c.stageId} is null and exists (
    select 1 from ${a} where ${a.contactId} = ${c.id}
  ))`;
  if (!userId) return sql`not ${candidateOnly}`;
  return sql`(not ${candidateOnly} or exists (
    select 1 from ${a} where ${a.contactId} = ${c.id} and ${canSeeApplication(userId)}
  ))`;
}

/** Timeline entries a user may see: hiring entries only with their application. Null: none. */
export function contactEventsVisibleTo(userId: string | null): SQL {
  const e = schema.contactEvents;
  if (!userId) return sql`${e.applicationId} is null`;
  return sql`(${e.applicationId} is null or exists (
    select 1 from ${a} where ${a.id} = ${e.applicationId} and ${canSeeApplication(userId)}
  ))`;
}

/** Bookings a user may see in full: interviews only with their application. Null: none. */
export function bookingsVisibleTo(userId: string | null): SQL {
  const b = schema.bookings;
  if (!userId) return sql`${b.applicationId} is null`;
  return sql`(${b.applicationId} is null or exists (
    select 1 from ${a} where ${a.id} = ${b.applicationId} and ${canSeeApplication(userId)}
  ))`;
}

/**
 * Reviews of one application the actor may read (the independence rule): their own, draft or
 * submitted; others' submitted reviews only for a stage where the actor owes no review and has
 * either submitted their own, coordinates the opportunity, or views it with `viewersSeeReviews`.
 * A coordinator assigned on a stage is blind on it until they submit, like everyone else.
 */
export function reviewsVisibleTo(
  actor: Actor,
  application: { id: string; opportunityId: string },
  opts: { viewersSeeReviews?: boolean } = {},
): SQL {
  const r = schema.reviews;
  const role = roleOn(actor, application.opportunityId);
  const seesOthersByRole =
    role === "coordinator" || (role === "viewer" && !!opts.viewersSeeReviews);
  return sql`(${r.applicationId} = ${application.id} and ${r.workspaceId} = ${actor.workspaceId} and (
    ${r.reviewerUserId} = ${actor.userId}
    or (
      ${r.status} = 'submitted'
      and not exists (
        select 1 from ${schema.reviewAssignments} ra
        where ra.application_id = ${r.applicationId} and ra.stage_id = ${r.stageId}
          and ra.reviewer_user_id = ${actor.userId} and ra.status = 'pending'
      )
      and (
        ${seesOthersByRole ? sql`true` : sql`false`}
        or exists (
          select 1 from ${r} mine
          where mine.application_id = ${r.applicationId} and mine.stage_id = ${r.stageId}
            and mine.reviewer_user_id = ${actor.userId} and mine.status = 'submitted'
        )
      )
    )
  ))`;
}

/**
 * An interview as people outside its application see it in booking lists and calendars: its time
 * and host, never the person or what they said (ADR 0005, "Interview" without the candidate).
 */
export function redactInterview<
  B extends {
    attendeeName: string;
    attendeeEmail: string;
    attendeePhone: string | null;
    notes: string | null;
    answers: Record<string, string>;
    guests: unknown;
    contactId: string | null;
    applicationId: string | null;
    brief: string | null;
    meetingUrl: string | null;
  },
>(b: B): B {
  return {
    ...b,
    attendeeName: "Interview",
    attendeeEmail: "",
    attendeePhone: null,
    notes: null,
    answers: {},
    guests: [] as unknown as B["guests"],
    contactId: null,
    applicationId: null,
    brief: null,
    meetingUrl: null,
    ...("contactCompany" in b ? { contactCompany: null } : {}),
  };
}

/* ---------------- Writes ---------------- */

/** The actor's role on an opportunity: owners and admins coordinate everywhere. */
export function roleOn(actor: Actor, opportunityId: string): OpportunityRole | null {
  if (isManager(actor.workspaceRole)) return "coordinator";
  return actor.opportunityRoles.get(opportunityId) ?? null;
}

/** What a role may do on its opportunity (ADR 0005's matrix). Reads go through the predicates. */
export const HIRING_ACTIONS = [
  "opportunity.view",
  "opportunity.configure",
  "opportunity.manage_team",
  "application.move",
  "application.message",
  "decision.record",
  "review.assign",
] as const;
export type HiringAction = (typeof HIRING_ACTIONS)[number];

const ROLE_ACTIONS: Record<OpportunityRole, ReadonlySet<HiringAction>> = {
  coordinator: new Set(HIRING_ACTIONS),
  reviewer: new Set<HiringAction>(["opportunity.view"]),
  interviewer: new Set<HiringAction>(["opportunity.view"]),
  viewer: new Set<HiringAction>(["opportunity.view"]),
};

export function canOnOpportunity(actor: Actor, opportunityId: string, action: HiringAction) {
  const role = roleOn(actor, opportunityId);
  return !!role && ROLE_ACTIONS[role].has(action);
}

export class HiringAccessError extends Error {
  constructor(
    readonly action: HiringAction | "team.coordinator_seat",
    message = "You don't have access to this.",
  ) {
    super(message);
  }
}

export function assertOnOpportunity(actor: Actor, opportunityId: string, action: HiringAction) {
  if (!canOnOpportunity(actor, opportunityId, action)) throw new HiringAccessError(action);
}

/**
 * A team role a person may hold, given their workspace role: collaborators review, interview or
 * view, but coordinating needs a member seat (ADR 0005). The error says how to get one.
 */
export function assertTeamRoleAllowed(workspaceRole: string, role: OpportunityRole) {
  if (role === "coordinator" && workspaceRole === "collaborator")
    throw new HiringAccessError(
      "team.coordinator_seat",
      "Collaborators can't coordinate. Upgrade them to a member seat first.",
    );
}
