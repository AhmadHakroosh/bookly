import { schema, sql, type SQL } from "@bookly/db";
import type { Booking, OpportunityRole } from "@bookly/db/schema";
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

/**
 * Any user's view of one application row (`app` is the applications table or an alias).
 * `viewers: false` leaves out people who only view: they see the card, never the documents
 * (planning/v2/ux README role table).
 */
export function canSeeApplication(
  userId: string,
  app: typeof a = a,
  { viewers = true }: { viewers?: boolean } = {},
): SQL {
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
          ${viewers ? sql`om.role = 'viewer'` : sql`false`}
          -- A collaborator never coordinates, whatever a stale row says (ADR 0005).
          or (om.role = 'coordinator' and not exists (
            select 1 from ${schema.members} m2
            join ${schema.workspaces} w2 on w2.organization_id = m2.organization_id
            where w2.id = ${app.workspaceId} and m2.user_id = ${userId} and m2.role = 'collaborator'
          ))
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
 * Files a user may see as far as hiring goes (the drive and `/files` add their own rules): a file
 * tied to applications (linked to one, sent with one's form, on one's timeline entry) needs one of
 * them visible; a file of a candidate-only person, or shared in their conversation, needs that
 * person visible. Null: none of those files.
 */
export function filesVisibleToHiring(userId: string | null): SQL {
  const f = schema.files;
  const visibleApp = (id: SQL, viewers = true) =>
    userId
      ? sql`exists (select 1 from ${a} where ${a.id} = ${id} and ${canSeeApplication(userId, a, { viewers })})`
      : sql`false`;
  const visibleContact = (id: SQL) =>
    sql`exists (select 1 from ${schema.contacts} where ${schema.contacts.id} = ${id} and ${contactsVisibleTo(userId)})`;
  return sql`(
    (not exists (
      select 1 from ${schema.fileLinks} l where l.file_id = ${f.id} and l.target_type = 'application'
    ) or exists (
      select 1 from ${schema.fileLinks} l
      where l.file_id = ${f.id} and l.target_type = 'application' and ${visibleApp(sql`l.target_id`)}
    ))
    and not exists (
      select 1 from ${schema.formResponses} r
      where ${f.ownerType} = 'form_response' and r.id = ${f.ownerId} and r.application_id is not null
        and not ${visibleApp(sql`r.application_id`, false)}
    )
    and not exists (
      select 1 from ${schema.fileLinks} l join ${schema.contactEvents} ev on ev.id = l.target_id
      where l.file_id = ${f.id} and l.target_type = 'contact_event' and ev.application_id is not null
        and not ${visibleApp(sql`ev.application_id`)}
    )
    and (${f.contactId} is null or ${visibleContact(sql`${f.contactId}`)})
    and not exists (
      select 1 from ${schema.fileLinks} l
      join ${schema.threadMessages} m on m.id = l.target_id
      join ${schema.threads} th on th.id = m.thread_id
      where l.file_id = ${f.id} and l.target_type = 'thread_message' and th.contact_id is not null
        and not ${visibleContact(sql`th.contact_id`)}
    )
  )`;
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
type InterviewPersonal =
  | "attendeeName"
  | "attendeeEmail"
  | "attendeePhone"
  | "notes"
  | "answers"
  | "guests"
  | "contactId"
  | "applicationId"
  | "stageId"
  | "brief"
  | "meetingUrl"
  | "manageToken"
  | "cancelReason"
  | "paymentRef";

export function redactInterview<B extends Pick<Booking, InterviewPersonal>>(b: B): B {
  const blank: Pick<Booking, InterviewPersonal> = {
    attendeeName: "Interview",
    attendeeEmail: "",
    attendeePhone: null,
    notes: null,
    answers: {},
    guests: [],
    contactId: null,
    applicationId: null,
    stageId: null,
    brief: null,
    meetingUrl: null,
    // The manage link opens the candidate's booking and lets its holder change it.
    manageToken: "",
    cancelReason: null,
    paymentRef: null,
  };
  return { ...b, ...blank, ...("contactCompany" in b ? { contactCompany: null } : {}) };
}

/* ---------------- Writes ---------------- */

/** The actor's role on an opportunity: owners and admins coordinate everywhere. */
export function roleOn(actor: Actor, opportunityId: string): OpportunityRole | null {
  if (isManager(actor.workspaceRole)) return "coordinator";
  const role = actor.opportunityRoles.get(opportunityId) ?? null;
  // A collaborator never coordinates, whatever a stale team row says.
  return role === "coordinator" && actor.workspaceRole === "collaborator" ? null : role;
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
