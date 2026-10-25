import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  notExists,
  schema,
  sql,
  type SQLWrapper,
} from "@bookly/db";
import type { EventQuestion, FormPurpose, Workspace } from "@bookly/db/schema";
import {
  answersFromEntries,
  FIELD_LABELS,
  flattenAnswers,
  isDisplayField,
  fromEventQuestions,
  parseFormSchema,
  sameSchema,
  toEventQuestions,
  validateResponse,
  type Answers,
  type FormSchema,
} from "@bookly/forms";
import { db } from "@/lib/db";
import { workspaceTag } from "./cache";
import { removeFile } from "./files";
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
 * The published form a public page renders natively (behind `forms_v2`), or null when the page
 * shows the legacy questions.
 */
export async function publicForm(
  ws: Pick<Workspace, "id" | "settings">,
  owner: { formId: string | null },
): Promise<{ formId: string; schema: FormSchema } | null> {
  if (!owner.formId || !(await hasFlag(ws, "forms_v2"))) return null;
  const published = await publishedSchema(ws.id, owner.formId);
  return published ? { formId: owner.formId, schema: published.schema } : null;
}

/**
 * A public form's posted answers, checked: hidden questions dropped, required ones answered,
 * files uploaded into this visitor's draft. `flat` is the plain-text projection kept on
 * bookings (`bookings.answers`) and shown in emails.
 */
export async function readPublicAnswers(
  ws: Pick<Workspace, "id">,
  form: { formId: string; schema: FormSchema },
  formData: FormData,
): Promise<
  { error: string } | { answers: Answers; flat: Record<string, string>; token: string | null }
> {
  const raw = answersFromEntries(form.schema, (name) => formData.getAll(name));
  const { answers, errors } = validateResponse(form.schema, raw);
  if (errors.length) return { error: errors[0]!.message };
  const token = String(formData.get("form_token") ?? "") || null;
  const draft = await draftResponse(ws.id, form.formId, token);
  const fileError = await checkFileAnswers(ws.id, form.schema, answers, draft);
  if (fileError) return { error: fileError };
  return { answers, flat: flattenAnswers(form.schema, answers), token };
}

/**
 * For the event type and routing editors behind `forms_v2`: the live questions in short and the
 * form to open in the builder (none yet for an event type that never had questions).
 */
export async function builderSummary(
  ws: Pick<Workspace, "id" | "settings">,
  formId: string | null,
) {
  if (!(await hasFlag(ws, "forms_v2"))) return null;
  const published = formId ? await publishedSchema(ws.id, formId) : null;
  return {
    formId,
    questions: (published?.schema.fields ?? [])
      .filter((f) => !isDisplayField(f.type))
      .map((f) => ({
        label: f.label,
        kind: FIELD_LABELS[f.type],
        conditional: !!f.visibleWhen?.conditions.length,
      })),
  };
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
  /** Create the form even for an event type without questions (the builder opens it). */
  always?: boolean;
}): Promise<string | null> {
  const { workspaceId, owner } = input;
  // Event types without questions need no form until the builder opens one; routing forms
  // always have one.
  if (!owner.formId && input.purpose === "booking" && !input.questions.length && !input.always)
    return null;
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

/* ---------------- The builder (S4) ---------------- */

export type FormOwner =
  | { type: "event_type"; id: string; label: string; userId: string }
  | { type: "routing_form"; id: string; label: string }
  /** Hiring: the application form, or a stage's follow-up or reference form. */
  | { type: "opportunity"; id: string; label: string }
  | { type: "none" };

/** What a form belongs to: the event type or routing form it asks the questions of. */
export async function formOwner(workspaceId: string, formId: string): Promise<FormOwner> {
  const [et, rf] = await Promise.all([
    db().query.eventTypes.findFirst({
      where: and(
        eq(schema.eventTypes.workspaceId, workspaceId),
        eq(schema.eventTypes.formId, formId),
      ),
      columns: { id: true, title: true, userId: true },
    }),
    db().query.routingForms.findFirst({
      where: and(
        eq(schema.routingForms.workspaceId, workspaceId),
        eq(schema.routingForms.formId, formId),
      ),
      columns: { id: true, name: true },
    }),
  ]);
  if (et) return { type: "event_type", id: et.id, label: et.title, userId: et.userId };
  if (rf) return { type: "routing_form", id: rf.id, label: rf.name };
  // Hiring: the opportunity whose application form it is, else the one whose live stage uses
  // it, for forms made for one opportunity only (shared forms stay with managers).
  const opp =
    (
      await db()
        .select({ id: schema.opportunities.id, title: schema.opportunities.title })
        .from(schema.opportunities)
        .where(
          and(
            eq(schema.opportunities.workspaceId, workspaceId),
            eq(schema.opportunities.formId, formId),
          ),
        )
        .limit(1)
    )[0] ??
    (
      await db()
        .select({ id: schema.opportunities.id, title: schema.opportunities.title })
        .from(schema.opportunities)
        .innerJoin(
          schema.pipelineStages,
          eq(schema.pipelineStages.pipelineId, schema.opportunities.pipelineId),
        )
        .innerJoin(schema.forms, eq(schema.forms.id, formId))
        .where(
          and(
            eq(schema.opportunities.workspaceId, workspaceId),
            eq(schema.forms.workspaceId, workspaceId),
            eq(schema.forms.shared, false),
            isNull(schema.pipelineStages.archivedAt),
            sql`${schema.pipelineStages.modules} -> 'forms' -> 'forms' @> ${JSON.stringify([{ formId }])}::jsonb`,
          ),
        )
        .orderBy(schema.opportunities.createdAt)
        .limit(1)
    )[0];
  if (opp) return { type: "opportunity", id: opp.id, label: opp.title };
  return { type: "none" };
}

/**
 * Who may change a form: an event type's questions, its host or an owner or admin (as the event
 * type editor); a routing form's, anyone on the team (as the routing editor); others, managers.
 */
export const mayEditForm = (
  owner: FormOwner,
  user: { id: string; manager: boolean; coordinates?: (opportunityId: string) => boolean },
) =>
  owner.type === "event_type"
    ? user.manager || owner.userId === user.id
    : owner.type === "opportunity"
      ? user.manager || !!user.coordinates?.(owner.id)
      : owner.type === "routing_form" || user.manager;

/**
 * A form as the builder opens it: the working copy (unpublished changes, else what is live),
 * what is live and its version number, and its owner.
 */
export async function formForBuilder(workspaceId: string, formId: string) {
  const form = await db().query.forms.findFirst({
    where: and(eq(schema.forms.id, formId), eq(schema.forms.workspaceId, workspaceId)),
  });
  if (!form || form.archivedAt) return null;
  const [live, owner] = await Promise.all([
    form.publishedVersionId
      ? db().query.formVersions.findFirst({
          where: eq(schema.formVersions.id, form.publishedVersionId),
        })
      : null,
    formOwner(workspaceId, formId),
  ]);
  const published = live?.schema ?? null;
  const working: FormSchema = form.draft ??
    published ?? { v: 1, pages: [{ id: "p1", fieldIds: [] }], fields: [] };
  return { form, working, published, version: live?.version ?? 0, owner };
}

/** Keeps the builder's working copy. Returns what is wrong with it, if anything. */
export async function saveFormDraft(
  workspaceId: string,
  formId: string,
  raw: unknown,
): Promise<{ problems: string[] }> {
  const parsed = parseFormSchema(raw);
  if ("problems" in parsed) return parsed;
  await db()
    .update(schema.forms)
    .set({ draft: parsed.schema })
    .where(and(eq(schema.forms.id, formId), eq(schema.forms.workspaceId, workspaceId)));
  return { problems: [] };
}

/** Drops unpublished changes. */
export async function discardFormDraft(workspaceId: string, formId: string) {
  await db()
    .update(schema.forms)
    .set({ draft: null })
    .where(and(eq(schema.forms.id, formId), eq(schema.forms.workspaceId, workspaceId)));
}

/** A consent text's version: it changes exactly when the words do, and is kept with each answer. */
export const consentVersion = (text: string) =>
  createHash("sha256").update(text.trim()).digest("hex").slice(0, 12);

/**
 * Publishes the builder's form as a new immutable version (none when nothing changed) and clears
 * the working copy. The owner's legacy `questions` follow, so emails, briefings and the pages
 * without `forms_v2` read the same questions (ADR 0004, dual read until 1.1).
 */
export async function publishForm(
  workspaceId: string,
  formId: string,
  raw: unknown,
  userId: string | null,
): Promise<{ problems: string[]; version?: number }> {
  const parsed = parseFormSchema(raw);
  if ("problems" in parsed) return parsed;
  const next: FormSchema = {
    ...parsed.schema,
    fields: parsed.schema.fields.map((f) =>
      f.consent ? { ...f, consent: { ...f.consent, version: consentVersion(f.consent.text) } } : f,
    ),
  };
  const version = await db().transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: schema.formVersions.version, schema: schema.formVersions.schema })
      .from(schema.formVersions)
      .where(eq(schema.formVersions.formId, formId))
      .orderBy(desc(schema.formVersions.version))
      .limit(1);
    if (latest && sameSchema(latest.schema, next)) {
      await tx.update(schema.forms).set({ draft: null }).where(eq(schema.forms.id, formId));
      return latest.version;
    }
    const [row] = await tx
      .insert(schema.formVersions)
      .values({
        workspaceId,
        formId,
        version: (latest?.version ?? 0) + 1,
        schema: next,
        publishedBy: userId,
      })
      .returning({ id: schema.formVersions.id, version: schema.formVersions.version });
    await tx
      .update(schema.forms)
      .set({ publishedVersionId: row!.id, draft: null })
      .where(and(eq(schema.forms.id, formId), eq(schema.forms.workspaceId, workspaceId)));
    return row!.version;
  });
  const questions = toEventQuestions(next) as EventQuestion[];
  await Promise.all([
    db()
      .update(schema.eventTypes)
      .set({ questions })
      .where(
        and(eq(schema.eventTypes.workspaceId, workspaceId), eq(schema.eventTypes.formId, formId)),
      ),
    db()
      .update(schema.routingForms)
      .set({ questions })
      .where(
        and(
          eq(schema.routingForms.workspaceId, workspaceId),
          eq(schema.routingForms.formId, formId),
        ),
      ),
  ]);
  return { problems: [], version };
}

/* ---------------- Responses: drafts, uploads, submission ---------------- */

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * A draft response, created when someone first uploads a file (and, for long forms, to resume
 * later). The token is the only way back to it: only its hash is stored.
 */
export async function startDraftResponse(
  workspaceId: string,
  formId: string,
  /** An edit of a submitted application: the draft belongs to it (and goes with it). */
  link: { applicationId: string; contactId: string } | null = null,
): Promise<{ id: string; token: string } | null> {
  const form = await db().query.forms.findFirst({
    where: and(eq(schema.forms.id, formId), eq(schema.forms.workspaceId, workspaceId)),
    columns: { publishedVersionId: true, archivedAt: true },
  });
  if (!form?.publishedVersionId || form.archivedAt) return null;
  const token = randomBytes(24).toString("base64url");
  const [row] = await db()
    .insert(schema.formResponses)
    .values({
      workspaceId,
      formId,
      formVersionId: form.publishedVersionId,
      status: "draft",
      resumeTokenHash: tokenHash(token),
      ...(link ?? {}),
    })
    .returning({ id: schema.formResponses.id });
  return { id: row!.id, token };
}

/** The draft response a token opens, on this form, still in draft. */
export async function draftResponse(
  workspaceId: string,
  formId: string,
  token: string | null | undefined,
) {
  if (!token || token.length > 100) return null;
  return (
    (await db().query.formResponses.findFirst({
      where: and(
        eq(schema.formResponses.workspaceId, workspaceId),
        eq(schema.formResponses.formId, formId),
        eq(schema.formResponses.resumeTokenHash, tokenHash(token)),
        eq(schema.formResponses.status, "draft"),
      ),
    })) ?? null
  );
}

/** Keeps a draft alive (the sweep goes by the last time it was touched). */
export async function touchDraft(id: string) {
  await db()
    .update(schema.formResponses)
    .set({ updatedAt: new Date() })
    .where(eq(schema.formResponses.id, id));
}

/**
 * Every file in the answers must be one this draft uploaded, for that question, and fully
 * arrived; anything else (another person's file id, a half-finished upload) is refused.
 */
export async function checkFileAnswers(
  workspaceId: string,
  formSchema: FormSchema,
  answers: Answers,
  draft: { id: string } | null,
): Promise<string | null> {
  for (const f of formSchema.fields) {
    const v = answers[f.id];
    if (f.type !== "file" || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const ids = [...new Set(v.fileIds)];
    if (!ids.length) continue;
    if (!draft || !ids.every((id) => UUID.test(id))) return `${f.label}: please upload it again.`;
    const rows = await db()
      .select({ id: schema.files.id })
      .from(schema.files)
      .where(
        and(
          eq(schema.files.workspaceId, workspaceId),
          inArray(schema.files.id, ids),
          eq(schema.files.ownerType, "form_response"),
          eq(schema.files.ownerId, draft.id),
          eq(schema.files.sourceId, f.id),
          eq(schema.files.status, "ready"),
          isNull(schema.files.deletedAt),
        ),
      );
    if (rows.length !== ids.length) return `${f.label}: please upload it again.`;
  }
  return null;
}

/**
 * Keeps a submission as a form response (behind `forms_v2`), validated against the version the
 * person saw. With the draft's token it finishes that draft (its uploads stay attached) and the
 * token stops working. Best-effort: the booking or routing it belongs to never fails because
 * of it.
 */
export async function recordResponse(input: {
  ws: Pick<Workspace, "id" | "settings">;
  formId: string | null;
  answers: Record<string, unknown>;
  token?: string | null;
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
    const values = {
      formVersionId: published.versionId,
      contactId: input.contactId ?? null,
      bookingId: input.bookingId ?? null,
      routingFormId: input.routingFormId ?? null,
      answers,
      status: "submitted" as const,
      submittedAt: new Date(),
    };
    const draft = await draftResponse(ws.id, formId, input.token);
    if (draft)
      await db()
        .update(schema.formResponses)
        .set({ ...values, resumeTokenHash: null })
        .where(eq(schema.formResponses.id, draft.id));
    else
      await db()
        .insert(schema.formResponses)
        .values({ workspaceId: ws.id, formId, ...values });
  } catch (e) {
    console.error("[forms] response not recorded", e);
  }
}

/** The files people sent with a booking's form, for the booking page. */
export async function responseFiles(workspaceId: string, bookingId: string) {
  return db()
    .select({
      id: schema.files.id,
      name: schema.files.name,
      size: schema.files.size,
      fieldId: schema.files.sourceId,
    })
    .from(schema.files)
    .innerJoin(schema.formResponses, eq(schema.formResponses.id, schema.files.ownerId))
    .where(
      and(
        eq(schema.files.workspaceId, workspaceId),
        eq(schema.files.ownerType, "form_response"),
        eq(schema.files.status, "ready"),
        eq(schema.formResponses.bookingId, bookingId),
        eq(schema.formResponses.status, "submitted"),
      ),
    );
}

/**
 * Daily: files of drafts nobody touched for a week go (and of responses deleted with their
 * booking), and drafts untouched for 30 days with them (ADR 0004).
 */
/** A draft application keeps its answers and files while its opportunity takes applications. */
const applying = (formId: SQLWrapper) =>
  sql`exists (select 1 from ${schema.opportunities} o where o.form_id = ${formId} and o.status = 'open')`;

export async function sweepFormDrafts(now = new Date()): Promise<number> {
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const month = new Date(now.getTime() - 30 * 86_400_000);
  const responses = schema.formResponses;
  const files = await db()
    .select()
    .from(schema.files)
    .where(
      and(
        eq(schema.files.ownerType, "form_response"),
        notExists(
          db()
            .select({ id: responses.id })
            .from(responses)
            .where(
              and(
                sql`${responses.id} = ${schema.files.ownerId}`,
                sql`not (${responses.status} = 'draft' and ${responses.updatedAt} < ${week} and not ${applying(responses.formId)})`,
              ),
            ),
        ),
      ),
    );
  for (const f of files) await removeFile(f, { silent: true });
  const gone = await db()
    .delete(responses)
    .where(
      and(
        eq(responses.status, "draft"),
        lt(responses.updatedAt, month),
        sql`not ${applying(responses.formId)}`,
      ),
    )
    .returning({ id: responses.id });
  return files.length + gone.length;
}
