import "server-only";
import { and, eq, schema } from "@bookly/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { audit } from "../audit";
import { AccessError, type Actor } from "../access";

/*
 * The one door to `application_sensitive` (ADR 0003): accommodation requests and voluntary
 * demographic answers. A guard test fails the build when the table is used anywhere else (bar the
 * retention cascade), so lists, boards, reviews, exports, search, webhooks and AI context can
 * never see it. Both fields are encrypted at rest. Demographics are written here and never read
 * per person in core; aggregate reports are a commercial module.
 */

type ApplicationRef = { id: string; workspaceId: string; opportunityId: string };

/** Keeps what the applicant chose to share, encrypted, with the consent it was given under. */
export async function writeSensitive(
  application: ApplicationRef,
  input: {
    accommodations?: string | null;
    demographics?: Record<string, string | string[]> | null;
    consentVersion?: string | null;
  },
): Promise<void> {
  const values = {
    ...(input.accommodations !== undefined && {
      accommodations: input.accommodations?.trim() ? encrypt(input.accommodations.trim()) : null,
    }),
    ...(input.demographics !== undefined && {
      demographics: input.demographics ? encrypt(JSON.stringify(input.demographics)) : null,
    }),
    ...(input.consentVersion !== undefined && {
      consentVersion: input.consentVersion,
      consentAt: input.consentVersion ? new Date() : null,
    }),
  };
  if (!Object.keys(values).length) return;
  await db()
    .insert(schema.applicationSensitive)
    .values({ applicationId: application.id, workspaceId: application.workspaceId, ...values })
    .onConflictDoUpdate({ target: schema.applicationSensitive.applicationId, set: values });
}

/**
 * Who may read an accommodation request: owners, admins and the opportunity's coordinators
 * (ADR 0005). Reviewers and interviewers never do; they are told an accommodation exists only
 * when a coordinator chooses to.
 */
export const mayReadAccommodations = (actor: Actor, opportunityId: string) =>
  actor.workspaceRole === "owner" ||
  actor.workspaceRole === "admin" ||
  actor.opportunityRoles.get(opportunityId) === "coordinator";

/** An applicant's accommodation request, for a coordinator. Every read is in the activity log. */
export async function readAccommodations(
  actor: Actor,
  application: ApplicationRef,
): Promise<string | null> {
  if (
    actor.workspaceId !== application.workspaceId ||
    !mayReadAccommodations(actor, application.opportunityId)
  )
    throw new AccessError("accommodations.read");
  const row = await db().query.applicationSensitive.findFirst({
    where: and(
      eq(schema.applicationSensitive.applicationId, application.id),
      eq(schema.applicationSensitive.workspaceId, application.workspaceId),
    ),
    columns: { accommodations: true },
  });
  if (!row?.accommodations) return null;
  await audit({
    workspace: application.workspaceId,
    action: "application.accommodations_viewed",
    target: { type: "application", id: application.id },
  });
  return decrypt(row.accommodations);
}

/**
 * The candidate's own adjustments request, for their status page (they hold the status link,
 * which is the only way to reach this). Not audited: it is their own data, shown back to them.
 */
export async function readOwnAccommodations(application: ApplicationRef): Promise<string | null> {
  const row = await db().query.applicationSensitive.findFirst({
    where: and(
      eq(schema.applicationSensitive.applicationId, application.id),
      eq(schema.applicationSensitive.workspaceId, application.workspaceId),
    ),
    columns: { accommodations: true },
  });
  return row?.accommodations ? decrypt(row.accommodations) : null;
}

/** For the retention and deletion cascade (the row also goes with its application). */
export async function deleteSensitive(applicationId: string): Promise<void> {
  await db()
    .delete(schema.applicationSensitive)
    .where(eq(schema.applicationSensitive.applicationId, applicationId));
}
