import "server-only";
import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";

/*
 * Hiring in the workspace export (ADR 0005): everything the workspace owns except what never
 * leaves its module. No sensitive answers (accommodations, demographics) and no draft reviews,
 * which are the reviewer's private notes until submitted.
 */
export async function hiringExport(workspaceId: string) {
  const byWs = <T extends { workspaceId: unknown }>(t: T) =>
    eq(t.workspaceId as never, workspaceId);
  const [
    opportunities,
    cohorts,
    applications,
    opportunityMembers,
    applicationAccess,
    scorecards,
    reviewAssignments,
    reviews,
    decisions,
    decisionBatches,
    dataRequests,
  ] = await Promise.all([
    db().select().from(schema.opportunities).where(byWs(schema.opportunities)),
    db().select().from(schema.opportunityCohorts).where(byWs(schema.opportunityCohorts)),
    db().select().from(schema.applications).where(byWs(schema.applications)),
    db().select().from(schema.opportunityMembers).where(byWs(schema.opportunityMembers)),
    db().select().from(schema.applicationAccess).where(byWs(schema.applicationAccess)),
    db().select().from(schema.scorecards).where(byWs(schema.scorecards)),
    db().select().from(schema.reviewAssignments).where(byWs(schema.reviewAssignments)),
    db()
      .select()
      .from(schema.reviews)
      .where(and(byWs(schema.reviews), eq(schema.reviews.status, "submitted"))),
    db().select().from(schema.decisions).where(byWs(schema.decisions)),
    db().select().from(schema.decisionBatches).where(byWs(schema.decisionBatches)),
    db().select().from(schema.dataRequests).where(byWs(schema.dataRequests)),
  ]);
  return {
    opportunities,
    cohorts,
    // Status-page tokens (the hash and the encrypted link) stay in the database: they open a
    // candidate's page.
    applications: applications.map((a) => ({ ...a, statusTokenHash: null, statusTokenEnc: null })),
    opportunityMembers,
    applicationAccess,
    scorecards,
    reviewAssignments,
    reviews,
    decisions,
    decisionBatches,
    dataRequests,
  };
}
