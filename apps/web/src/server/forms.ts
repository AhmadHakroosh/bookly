import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, schema, sql } from "@bookly/db";
import type { EventQuestion, FormPurpose, Workspace } from "@bookly/db/schema";
import {
  fromEventQuestions,
  sameSchema,
  toEventQuestions,
  validateResponse,
  type FormSchema,
} from "@bookly/forms";
import { db } from "@/lib/db";
import { workspaceTag } from "./cache";
import { hasFlag } from "./flags";

/**
 * Forms (ADR 0004), slice S3: booking questions and routing questionnaires are versioned forms.
 * Until 1.1 the legacy `questions` columns stay the source the editors write; every save also
 * publishes the same questions as a new form version when they changed. Behind `forms_v2` the
 * public pages read the published form instead, and each submission is kept as a form
 * response. Both paths show the same questions.
 */

/** A form's published schema. Versions are immutable, so this only refreshes on publish. */
export async function publishedSchema(
  workspaceId: string,
  formId: string,
): Promise<{ versionId: string; schema: FormSchema } | null> {
  "use cache";
  cacheTag(workspaceTag(workspaceId));
  cacheLife("hours");
  const [row] = await db()
    .select({ versionId: schema.formVersions.id, schema: schema.formVersions.schema })
    .from(schema.forms)
    .innerJoin(schema.formVersions, eq(schema.formVersions.id, schema.forms.publishedVersionId))
    .where(and(eq(schema.forms.id, formId), eq(schema.forms.workspaceId, workspaceId)));
  return row ?? null;
}

type Owner = { formId: string | null; questions: EventQuestion[] };

/** The questions a public page shows: the published form behind `forms_v2`, else the column. */
export async function formQuestions(
  ws: Pick<Workspace, "id" | "settings">,
  owner: Owner,
): Promise<EventQuestion[]> {
  if (!owner.formId || !(await hasFlag(ws, "forms_v2"))) return owner.questions;
  const published = await publishedSchema(ws.id, owner.formId);
  return published ? toEventQuestions(published.schema) : owner.questions;
}

/**
 * Keeps an owner's inline form in step with its legacy questions: creates the form the first
 * time, and publishes a new version only when the questions changed. Returns the form id.
 */
export async function syncInlineForm(input: {
  workspaceId: string;
  purpose: Extract<FormPurpose, "booking" | "routing">;
  name: string;
  owner: { table: "event_types" | "routing_forms"; id: string; formId: string | null };
  questions: EventQuestion[];
  userId: string | null;
}): Promise<string | null> {
  const { workspaceId, owner } = input;
  // Event types without questions need no form; routing forms always have one.
  if (!owner.formId && input.purpose === "booking" && !input.questions.length) return null;
  const next = fromEventQuestions(input.questions);
  return db().transaction(async (tx) => {
    let formId = owner.formId;
    if (!formId) {
      const [form] = await tx
        .insert(schema.forms)
        .values({
          workspaceId,
          name: input.name,
          purpose: input.purpose,
          shared: input.purpose === "routing",
          createdBy: input.userId,
        })
        .returning({ id: schema.forms.id });
      formId = form!.id;
      const table = owner.table === "event_types" ? schema.eventTypes : schema.routingForms;
      await tx.update(table).set({ formId }).where(eq(table.id, owner.id));
    } else {
      await tx.update(schema.forms).set({ name: input.name }).where(eq(schema.forms.id, formId));
    }
    const [latest] = await tx
      .select({ version: schema.formVersions.version, schema: schema.formVersions.schema })
      .from(schema.formVersions)
      .where(eq(schema.formVersions.formId, formId))
      .orderBy(desc(schema.formVersions.version))
      .limit(1);
    if (latest && sameSchema(latest.schema, next)) return formId;
    const [version] = await tx
      .insert(schema.formVersions)
      .values({
        workspaceId,
        formId,
        version: (latest?.version ?? 0) + 1,
        schema: next,
        publishedBy: input.userId,
      })
      .returning({ id: schema.formVersions.id });
    await tx
      .update(schema.forms)
      .set({ publishedVersionId: version!.id, updatedAt: sql`now()` })
      .where(eq(schema.forms.id, formId));
    return formId;
  });
}

/**
 * Keeps a submission as a form response (behind `forms_v2`), validated against the version the
 * person saw. Best-effort: the booking or routing it belongs to never fails because of it.
 */
export async function recordResponse(input: {
  ws: Pick<Workspace, "id" | "settings">;
  formId: string | null;
  answers: Record<string, string>;
  contactId?: string | null;
  bookingId?: string | null;
  routingFormId?: string | null;
}): Promise<void> {
  const { ws, formId } = input;
  if (!formId || !(await hasFlag(ws, "forms_v2"))) return;
  try {
    const published = await publishedSchema(ws.id, formId);
    if (!published) return;
    const { answers } = validateResponse(published.schema, input.answers);
    await db()
      .insert(schema.formResponses)
      .values({
        workspaceId: ws.id,
        formId,
        formVersionId: published.versionId,
        contactId: input.contactId ?? null,
        bookingId: input.bookingId ?? null,
        routingFormId: input.routingFormId ?? null,
        answers,
        status: "submitted",
        submittedAt: new Date(),
      });
  } catch (e) {
    console.error("[forms] response not recorded", e);
  }
}
