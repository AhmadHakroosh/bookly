import "server-only";
import { and, asc, desc, eq, schema, sql } from "@bookly/db";
import type { Opportunity, OpportunityRole } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { applicationsVisibleTo, reviewsVisibleTo, roleOn, type Actor } from "../access";

/*
 * Every hiring read (ADR 0005). Each function takes the actor first (a guard test checks it) and
 * filters inside the query with the access predicates, so no caller can forget the check. Reads
 * depend on the viewer: per-request only, never `"use cache"`.
 */

export type OpportunityListing = Pick<Opportunity, "id" | "title" | "status" | "type" | "slug"> & {
  /** The actor's team role (owners and admins coordinate); null = may only see it exists. */
  role: OpportunityRole | null;
};

/**
 * Opportunities in the actor's workspace. Members see that every opportunity exists (title,
 * status); collaborators see only those whose team they are on.
 */
export async function listOpportunities(actor: Actor): Promise<OpportunityListing[]> {
  const o = schema.opportunities;
  const rows = await db()
    .select({ id: o.id, title: o.title, status: o.status, type: o.type, slug: o.slug })
    .from(o)
    .where(eq(o.workspaceId, actor.workspaceId))
    .orderBy(desc(o.createdAt));
  return rows
    .map((r) => ({ ...r, role: roleOn(actor, r.id) }))
    .filter((r) => r.role !== null || actor.workspaceRole !== "collaborator");
}

/** One opportunity in full, for its team; null for anyone else. */
export async function getOpportunity(actor: Actor, id: string) {
  if (!roleOn(actor, id)) return null;
  return (
    (await db().query.opportunities.findFirst({
      where: and(
        eq(schema.opportunities.id, id),
        eq(schema.opportunities.workspaceId, actor.workspaceId),
      ),
    })) ?? null
  );
}

/** Applications of one opportunity the actor may see, oldest in their stage first (the board). */
export async function listApplications(
  actor: Actor,
  opportunityId: string,
  opts: { stageId?: string; limit?: number } = {},
) {
  const a = schema.applications;
  return db()
    .select()
    .from(a)
    .where(
      and(
        applicationsVisibleTo(actor),
        eq(a.opportunityId, opportunityId),
        opts.stageId ? eq(a.stageId, opts.stageId) : undefined,
      ),
    )
    .orderBy(asc(a.stageEnteredAt), asc(a.id))
    .limit(Math.min(opts.limit ?? 200, 500));
}

/** One application the actor may see, with its person; null otherwise. */
export async function getApplication(actor: Actor, id: string) {
  const a = schema.applications;
  const [row] = await db()
    .select({ application: a, contact: schema.contacts })
    .from(a)
    .innerJoin(schema.contacts, eq(schema.contacts.id, a.contactId))
    .where(and(applicationsVisibleTo(actor), eq(a.id, id)));
  return row ?? null;
}

/** The reviews of an application the actor may read now (the independence rule). */
export async function listReviews(actor: Actor, applicationId: string) {
  const app = await getApplication(actor, applicationId);
  if (!app) return [];
  const opp = await db().query.opportunities.findFirst({
    where: eq(schema.opportunities.id, app.application.opportunityId),
    columns: { settings: true },
  });
  const viewersSeeReviews = !!(opp?.settings as { viewersSeeReviews?: boolean } | undefined)
    ?.viewersSeeReviews;
  return db()
    .select()
    .from(schema.reviews)
    .where(
      reviewsVisibleTo(
        actor,
        { id: applicationId, opportunityId: app.application.opportunityId },
        { viewersSeeReviews },
      ),
    )
    .orderBy(asc(schema.reviews.submittedAt));
}

/** The team of an opportunity, for anyone on it. */
export async function listTeam(actor: Actor, opportunityId: string) {
  if (!roleOn(actor, opportunityId)) return [];
  return db()
    .select({
      userId: schema.opportunityMembers.userId,
      role: schema.opportunityMembers.role,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.opportunityMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.opportunityMembers.userId))
    .where(
      and(
        eq(schema.opportunityMembers.opportunityId, opportunityId),
        eq(schema.opportunityMembers.workspaceId, actor.workspaceId),
      ),
    )
    .orderBy(sql`case ${schema.opportunityMembers.role} when 'coordinator' then 0 else 1 end`);
}
