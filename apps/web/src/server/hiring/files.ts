import "server-only";
import { and, eq, inArray, isNotNull, schema } from "@bookly/db";
import type { StoredFile } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { canSeeApplication } from "../access/hiring";

/**
 * Whether a file belongs to an application the user may not see (ADR 0005): linked to it, or
 * sent with its form. Files of no application are left to the drive's own rules.
 */
export async function hiddenByHiring(
  file: Pick<StoredFile, "id" | "ownerType" | "ownerId">,
  userId: string,
): Promise<boolean> {
  const [linked, sent] = await Promise.all([
    db()
      .select({ id: schema.fileLinks.targetId })
      .from(schema.fileLinks)
      .where(
        and(eq(schema.fileLinks.fileId, file.id), eq(schema.fileLinks.targetType, "application")),
      ),
    file.ownerType === "form_response" && file.ownerId
      ? db()
          .select({ id: schema.formResponses.applicationId })
          .from(schema.formResponses)
          .where(
            and(
              eq(schema.formResponses.id, file.ownerId),
              isNotNull(schema.formResponses.applicationId),
            ),
          )
      : Promise.resolve([]),
  ]);
  const ids = [...linked, ...sent].map((r) => r.id).filter((x): x is string => !!x);
  if (!ids.length) return false;
  const [visible] = await db()
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(and(inArray(schema.applications.id, ids), canSeeApplication(userId)))
    .limit(1);
  return !visible;
}
