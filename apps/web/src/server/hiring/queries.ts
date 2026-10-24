import "server-only";
import { and, asc, desc, eq, inArray, ne, schema, sql } from "@bookly/db";
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

export type OpportunitySummary = OpportunityListing & {
  cohort: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
  decidesBy: Date | null;
  /** Applications the actor may see that were sent (drafts are not counted). */
  applications: number;
};

/**
 * Opportunities with their round's dates and how many applications the actor may see, for the
 * Opportunities list and the Hiring overview. Archived ones are left out unless asked for.
 */
export async function listOpportunitySummaries(
  actor: Actor,
  opts: { archived?: boolean } = {},
): Promise<OpportunitySummary[]> {
  const list = (await listOpportunities(actor)).filter(
    (x) => opts.archived || x.status !== "archived",
  );
  if (!list.length) return [];
  const ids = list.map((x) => x.id);
  const c = schema.opportunityCohorts;
  const a = schema.applications;
  const [cohorts, counts] = await Promise.all([
    db()
      .select({
        opportunityId: c.opportunityId,
        name: c.name,
        opensAt: c.opensAt,
        closesAt: c.closesAt,
        decidesBy: c.decidesBy,
      })
      .from(c)
      .where(and(inArray(c.opportunityId, ids), eq(c.isDefault, true))),
    db()
      .select({ opportunityId: a.opportunityId, n: sql<number>`count(*)::int` })
      .from(a)
      .where(and(applicationsVisibleTo(actor), inArray(a.opportunityId, ids), ne(a.state, "draft")))
      .groupBy(a.opportunityId),
  ]);
  return list.map((x) => {
    const k = cohorts.find((r) => r.opportunityId === x.id);
    return {
      ...x,
      cohort: k?.name || null,
      opensAt: k?.opensAt ?? null,
      closesAt: k?.closesAt ?? null,
      decidesBy: k?.decidesBy ?? null,
      applications: x.role ? (counts.find((r) => r.opportunityId === x.id)?.n ?? 0) : 0,
    };
  });
}

/**
 * The counts beside an opportunity's tabs ("24 applications · 6 interviews this week · 8 reviews
 * pending"), each over what the actor may see.
 */
export async function opportunityCounts(actor: Actor, opportunityId: string, now = new Date()) {
  if (!roleOn(actor, opportunityId)) return { applications: 0, interviews: 0, reviews: 0 };
  const a = schema.applications;
  const visible = and(applicationsVisibleTo(actor), eq(a.opportunityId, opportunityId));
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const [apps, interviews, reviews] = await Promise.all([
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(a)
      .where(and(visible, ne(a.state, "draft"))),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .innerJoin(a, eq(a.id, schema.bookings.applicationId))
      .where(
        and(
          visible,
          eq(schema.bookings.status, "confirmed"),
          sql`${schema.bookings.startAt} >= ${now} and ${schema.bookings.startAt} < ${weekEnd}`,
        ),
      ),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reviewAssignments)
      .innerJoin(a, eq(a.id, schema.reviewAssignments.applicationId))
      .where(and(visible, eq(schema.reviewAssignments.status, "pending"))),
  ]);
  return {
    applications: apps[0]?.n ?? 0,
    interviews: interviews[0]?.n ?? 0,
    reviews: reviews[0]?.n ?? 0,
  };
}

/** Applications per stage the actor may see, for the board's column counts. */
export async function stageTotals(actor: Actor, opportunityId: string) {
  const a = schema.applications;
  const rows = await db()
    .select({ stageId: a.stageId, n: sql<number>`count(*)::int` })
    .from(a)
    .where(
      and(applicationsVisibleTo(actor), eq(a.opportunityId, opportunityId), ne(a.state, "draft")),
    )
    .groupBy(a.stageId);
  return new Map(rows.filter((r) => r.stageId).map((r) => [r.stageId!, r.n]));
}
