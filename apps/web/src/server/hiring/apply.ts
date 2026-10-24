import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, ne, schema, sql } from "@bookly/db";
import type { Application, Opportunity, Workspace } from "@bookly/db/schema";
import {
  coerceAnswers,
  evaluate,
  validateResponse,
  type Answers,
  type FormSchema,
} from "@bookly/forms";
import { loadEnv } from "@bookly/config";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { assertOnOpportunity, type Actor } from "../access";
import { audit, type AuditActor } from "../audit";
import { refreshWorkspace } from "../cache";
import { removeFile } from "../files";
import { checkFileAnswers, draftResponse, publishedSchema } from "../forms";
import { notify } from "../notifications";
import { readModules } from "../pipelines/modules";
import { rateLimit } from "../ratelimit";
import { publicBaseUrl } from "../urls";
import { emitEvent } from "../webhooks";
import {
  applicationWindow,
  COPY,
  DELETION_DAYS,
  EMAIL,
  fmtDay,
  identityFields,
  LINK_DAYS,
  maskEmail,
  mayEdit,
  type Window,
} from "./apply-text";
import { closeGraceMinutes } from "./hiring-text";
import { readOwnAccommodations, writeSensitive } from "./sensitive";
import { candidateLabel, isFinal, type SetupStage } from "./setup-text";

/*
 * Applying, and everything a candidate does after (planning/v2/ux/application-page.md, ADR
 * 0003): public, so nothing here has an actor. The candidate is whoever holds a token: a
 * draft's resume token (a form-response draft; drafts never become applications or contacts
 * until they are submitted, so the team never sees them) or the status token, hashed at rest,
 * random, never derived from the email, rotated on recovery and valid for 30 days after the
 * last email that carried it. Every step that could tell a stranger whether someone applied
 * answers the same either way.
 */

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");
const days = (n: number) => n * 86_400_000;
const CANDIDATE: AuditActor = { type: "guest", label: "Applicant" };

/* ---------------- The opportunity, publicly ---------------- */

/** The token that opens a draft opportunity's application page for its coordinators. */
export function previewToken(opportunityId: string): string {
  return createHmac("sha256", loadEnv().AUTH_SECRET)
    .update(`apply-preview:${opportunityId}`)
    .digest("base64url")
    .slice(0, 32);
}

const previewOk = (opportunityId: string, token: string | undefined) => {
  if (!token) return false;
  const a = Buffer.from(previewToken(opportunityId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

export type PublicOpportunity = Awaited<ReturnType<typeof publicOpportunity>>;

/**
 * An opportunity's application page data, or null when there is none to show (unknown slug,
 * draft without a valid preview token, archived). Hiring must be on for the workspace.
 */
export async function publicOpportunity(
  ws: Pick<Workspace, "id" | "timezone">,
  slug: string,
  opts: { preview?: string } = {},
) {
  const [opp] = await db()
    .select()
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.workspaceId, ws.id), eq(schema.opportunities.slug, slug)));
  if (!opp || opp.status === "archived") return null;
  const preview = previewOk(opp.id, opts.preview);
  if (opp.status === "draft" && !preview) return null;
  const [cohort, stages, form] = await Promise.all([
    db()
      .select()
      .from(schema.opportunityCohorts)
      .where(eq(schema.opportunityCohorts.opportunityId, opp.id))
      .orderBy(
        sql`${schema.opportunityCohorts.isDefault} desc`,
        asc(schema.opportunityCohorts.position),
      )
      .limit(1)
      .then((r) => r[0] ?? null),
    db()
      .select()
      .from(schema.pipelineStages)
      .where(
        and(
          eq(schema.pipelineStages.pipelineId, opp.pipelineId),
          isNull(schema.pipelineStages.archivedAt),
        ),
      )
      .orderBy(asc(schema.pipelineStages.position)),
    formOf(opp, preview),
  ]);
  return {
    opportunity: opp,
    cohort,
    stages: stages.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      category: s.category,
      isEntry: s.isEntry,
      isWaitlist: s.isWaitlist,
      label: opp.settings.statusLabels?.[s.key] ?? null,
      modules: readModules(s.modules).modules,
    })),
    form,
    preview,
    timezone: opp.settings.timezone ?? ws.timezone,
    graceMinutes: closeGraceMinutes(opp.settings),
  };
}

/** The application form applicants answer: what is published (or, in a preview, the working copy). */
async function formOf(opp: Opportunity, preview: boolean) {
  if (!opp.formId) return null;
  const published = await publishedSchema(opp.workspaceId, opp.formId);
  if (published)
    return { id: opp.formId, schema: published.schema, versionId: published.versionId };
  if (!preview) return null;
  const f = await db().query.forms.findFirst({ where: eq(schema.forms.id, opp.formId) });
  return f?.draft ? { id: opp.formId, schema: f.draft, versionId: null } : null;
}

const windowOf = (
  p: NonNullable<PublicOpportunity>,
  draftStartedAt?: Date | null,
  now = new Date(),
) =>
  applicationWindow({
    status: p.opportunity.status,
    opensAt: p.cohort?.opensAt ?? null,
    closesAt: p.cohort?.closesAt ?? null,
    graceMinutes: p.graceMinutes,
    draftStartedAt,
    now,
  });

export class ApplyError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/* ---------------- Drafts ---------------- */

/** Answers kept as typed, without the checks a submission gets (drafts can be half done). */
function draftAnswers(form: FormSchema, raw: Record<string, unknown>): Answers {
  const known = new Set(form.fields.map((f) => f.id));
  const typed = coerceAnswers(
    form,
    Object.fromEntries(Object.entries(raw).filter(([k]) => known.has(k))),
  );
  return Object.fromEntries(
    Object.entries(typed).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 10_000) : v]),
  );
}

/** A draft's answers and when it was started, for its token (on this opportunity's form). */
export async function openDraft(
  ws: Pick<Workspace, "id">,
  formId: string,
  token: string | undefined,
) {
  const d = await draftResponse(ws.id, formId, token);
  return d ? { id: d.id, answers: d.answers as Answers, startedAt: d.createdAt } : null;
}

/**
 * Keeps a draft's answers (autosave). Creates the draft on the first save; the token is the
 * candidate's way back, and the uploads' (`x-form-token`). Never creates an application.
 */
export async function saveDraft(
  ws: Pick<Workspace, "id" | "timezone">,
  slug: string,
  input: { token: string | null; answers: Record<string, unknown> },
): Promise<{ token: string; savedAt: Date }> {
  const p = await publicOpportunity(ws, slug);
  if (!p?.form?.versionId) throw new ApplyError(COPY.unavailable, 404);
  const draft = input.token ? await draftResponse(ws.id, p.form.id, input.token) : null;
  if (windowOf(p, draft?.createdAt) === "closed" || windowOf(p, draft?.createdAt) === "scheduled")
    throw new ApplyError("Applications aren't open.", 409);
  const answers = draftAnswers(p.form.schema, input.answers);
  const now = new Date();
  if (draft) {
    await db()
      .update(schema.formResponses)
      .set({ answers, updatedAt: now })
      .where(eq(schema.formResponses.id, draft.id));
    return { token: input.token!, savedAt: now };
  }
  const limit = await rateLimit(`apply-draft:${p.opportunity.id}`, 600, 3600_000);
  if (!limit.ok)
    throw new ApplyError("Too many people are applying right now. Try again shortly.", 429);
  const token = newToken();
  await db()
    .insert(schema.formResponses)
    .values({
      workspaceId: ws.id,
      formId: p.form.id,
      formVersionId: p.form.versionId,
      status: "draft",
      answers,
      resumeTokenHash: hash(token),
    });
  return { token, savedAt: now };
}

/** "Save and finish later": emails the resume link to the address in the draft. */
export async function sendResumeLink(
  ws: Workspace,
  slug: string,
  token: string,
): Promise<{ sentTo: string }> {
  const p = await publicOpportunity(ws, slug);
  if (!p?.form) throw new ApplyError(COPY.unavailable, 404);
  const draft = await draftResponse(ws.id, p.form.id, token);
  if (!draft) throw new ApplyError("Your draft has expired. Start again.", 404);
  const field = identityFields(p.form.schema).email;
  const email = field
    ? String((draft.answers as Answers)[field.id] ?? "")
        .trim()
        .toLowerCase()
    : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApplyError("Enter your email first, so we can send you the link.");
  const limit = await rateLimit(`apply-resume:${email}`, 5, 3600_000);
  if (!limit.ok) throw new ApplyError(COPY.recoverLimited, 429);
  const base = await publicBaseUrl(ws);
  await candidateEmail(ws, p.opportunity, {
    to: email,
    subject: EMAIL.resume(p.opportunity.title),
    body: `Here's the link to finish your application to ${p.opportunity.title}. It works on any device until applications close.`,
    cta: {
      href: `${base}/apply/${p.opportunity.slug}/resume/${token}`,
      label: "Finish my application",
    },
  });
  return { sentTo: maskEmail(email) };
}

/* ---------------- Submit ---------------- */

export type SubmitInput = {
  token: string | null;
  answers: Record<string, unknown>;
  accommodations: string;
  consent: boolean;
  futureContact: boolean;
};

export type SubmitResult =
  | { ok: true; statusToken: string; email: string }
  | { ok: false; duplicate: true; email: string }
  | { ok: false; errors: Record<string, string> };

/**
 * Submits an application (ADR 0003): checks the window and every answer against the published
 * form, upserts the contact with no client stage and without the contact webhook or CRM sync
 * (ADR 0005), creates the application at the entry stage with a fresh status link, applies the
 * entry stage's routing (tracks and flags, never a rejection), keeps any accommodations request
 * in the restricted table, emails the confirmation and tells the coordinators.
 */
export async function submitApplication(
  ws: Workspace,
  slug: string,
  input: SubmitInput,
): Promise<SubmitResult> {
  const p = await publicOpportunity(ws, slug);
  if (!p?.form?.versionId) throw new ApplyError(COPY.unavailable, 404);
  const { opportunity: opp, cohort } = p;
  const draft = input.token ? await draftResponse(ws.id, p.form.id, input.token) : null;
  const win = windowOf(p, draft?.createdAt);
  if (win === "closed" || win === "scheduled")
    throw new ApplyError("Applications aren't open.", 409);
  if (!cohort) throw new ApplyError(COPY.unavailable, 404);

  const checked = validateResponse(p.form.schema, input.answers);
  const answers: Answers = checked.answers;
  const errors: Record<string, string> = Object.fromEntries(
    checked.errors.map((e) => [e.fieldId, e.message]),
  );
  const ids = identityFields(p.form.schema);
  const email = ids.email
    ? String(answers[ids.email.id] ?? input.answers[ids.email.id] ?? "")
        .trim()
        .toLowerCase()
    : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors[ids.email?.id ?? "email"] = "Enter a valid email.";
  if (!input.consent) errors.consent = "Agree to the privacy notice to apply.";
  if (input.accommodations.length > 4000) errors.accommodations = "Keep it under 4,000 characters.";
  if (!Object.keys(errors).length) {
    const fileProblem = await checkFileAnswers(ws.id, p.form.schema, answers, draft);
    if (fileProblem) errors.files = fileProblem;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const name = ids.name
    ? String(answers[ids.name.id] ?? "")
        .trim()
        .slice(0, 200)
    : "";

  const limit = await rateLimit(`apply-submit:${email}`, 10, 3600_000);
  if (!limit.ok) throw new ApplyError(COPY.recoverLimited, 429);

  // Already applied to this round: the email is the proof, so the link goes there, not here.
  const existing = await applicationOf(ws.id, cohort.id, email);
  if (existing) {
    await resendStatusLink(ws, opp, existing, email);
    return { ok: false, duplicate: true, email: maskEmail(email) };
  }

  const entry = p.stages.find((s) => s.isEntry)!;
  const tags: string[] = [];
  const flags: Application["flags"] = [];
  const at = new Date();
  for (const [i, r] of (entry.modules.routing?.enabled !== false
    ? (entry.modules.routing?.rules ?? [])
    : []
  ).entries()) {
    const group = { match: r.match, conditions: r.conditions } as Parameters<typeof evaluate>[0];
    if (!evaluate(group, answers)) continue;
    if ("tag" in r.to && r.to.tag) tags.push(r.to.tag);
    if ("flag" in r.to && r.to.flag)
      flags.push({
        kind: "requirement",
        requirement: r.to.flag,
        ruleId: `routing:${i}`,
        at: at.toISOString(),
      });
  }
  const statusToken = newToken();
  const notice = opp.settings.privacyNotice;

  const app = await db().transaction(async (tx) => {
    // A candidate is a contact with no client stage: no `contact.created`, no CRM sync.
    await tx
      .insert(schema.contacts)
      .values({ workspaceId: ws.id, email, name, stageId: null })
      .onConflictDoNothing();
    const [contact] = await tx
      .select({ id: schema.contacts.id, name: schema.contacts.name })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.workspaceId, ws.id), eq(schema.contacts.email, email)));
    if (!contact!.name && name)
      await tx.update(schema.contacts).set({ name }).where(eq(schema.contacts.id, contact!.id));
    const [row] = await tx
      .insert(schema.applications)
      .values({
        workspaceId: ws.id,
        opportunityId: opp.id,
        cohortId: cohort.id,
        contactId: contact!.id,
        stageId: entry.id,
        stageEnteredAt: at,
        state: "active",
        source: "direct",
        tags: [...new Set(tags)].slice(0, 20),
        flags,
        statusTokenHash: hash(statusToken),
        statusTokenExpiresAt: new Date(at.getTime() + days(LINK_DAYS)),
        privacyVersion: notice?.version ?? null,
        privacyConsentAt: at,
        futureContact: input.futureContact,
        submittedAt: at,
        lastActivityAt: at,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return null;
    const response = {
      workspaceId: ws.id,
      formId: p.form!.id,
      formVersionId: p.form!.versionId!,
      contactId: contact!.id,
      applicationId: row.id,
      answers,
      status: "submitted" as const,
      submittedAt: at,
      resumeTokenHash: null,
    };
    let responseId: string;
    if (draft) {
      await tx
        .update(schema.formResponses)
        .set(response)
        .where(eq(schema.formResponses.id, draft.id));
      responseId = draft.id;
    } else {
      const [r] = await tx
        .insert(schema.formResponses)
        .values(response)
        .returning({ id: schema.formResponses.id });
      responseId = r!.id;
    }
    await tx
      .update(schema.applications)
      .set({ formResponseId: responseId })
      .where(eq(schema.applications.id, row.id));
    await tx.insert(schema.stageTransitions).values({
      workspaceId: ws.id,
      pipelineId: opp.pipelineId,
      subjectType: "application",
      subjectId: row.id,
      fromStageId: null,
      toStageId: entry.id,
      actorType: "candidate",
    });
    await tx.insert(schema.contactEvents).values({
      workspaceId: ws.id,
      contactId: contact!.id,
      applicationId: row.id,
      type: "form_submitted",
      summary: `Applied to ${opp.title}`.slice(0, 500),
      data: { opportunityId: opp.id },
    });
    return { ...row, formResponseId: responseId };
  });
  if (!app) {
    // Two submissions at once: the other one won.
    const winner = await applicationOf(ws.id, cohort.id, email);
    if (winner) await resendStatusLink(ws, opp, winner, email);
    return { ok: false, duplicate: true, email: maskEmail(email) };
  }
  if (input.accommodations.trim())
    await writeSensitive(app, { accommodations: input.accommodations });

  const base = await publicBaseUrl(ws);
  await confirmationEmail(ws, p, app, email, name, `${base}/applications/${statusToken}`);
  await audit({
    workspace: ws.id,
    action: "application.submitted",
    target: { type: "application", id: app.id, label: opp.title },
    actor: CANDIDATE,
    changes: { opportunity: { to: opp.id } },
  });
  // Ids only: hiring data stays out of unscoped receivers (ADR 0005).
  emitEvent(ws.id, "application.submitted", {
    id: app.id,
    opportunityId: opp.id,
    cohortId: cohort.id,
    stage: { key: entry.key, category: entry.category },
    submittedAt: at.toISOString(),
  });
  await tellCoordinators(ws, opp, {
    title: `New application for ${opp.title}`,
    body: name || "An applicant",
    dedupeKey: `application.submitted:${app.id}`,
  });
  refreshWorkspace(ws.id);
  return { ok: true, statusToken, email: maskEmail(email) };
}

async function applicationOf(workspaceId: string, cohortId: string, email: string) {
  const [row] = await db()
    .select({ application: schema.applications })
    .from(schema.applications)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.applications.contactId))
    .where(
      and(
        eq(schema.applications.workspaceId, workspaceId),
        eq(schema.applications.cohortId, cohortId),
        eq(schema.contacts.email, email),
        ne(schema.applications.state, "draft"),
      ),
    );
  return row?.application ?? null;
}

/** The entry stage's on-enter email (the template's "Application received"), else ours. */
async function confirmationEmail(
  ws: Workspace,
  p: NonNullable<PublicOpportunity>,
  app: Pick<Application, "id">,
  email: string,
  name: string,
  statusUrl: string,
) {
  const entry = p.stages.find((s) => s.isEntry)!;
  const rules = await db()
    .select({ actions: schema.stageRules.actions, trigger: schema.stageRules.trigger })
    .from(schema.stageRules)
    .where(and(eq(schema.stageRules.stageId, entry.id), eq(schema.stageRules.active, true)))
    .orderBy(asc(schema.stageRules.position));
  const templateId = rules
    .filter((r) => r.trigger.on === "enter")
    .flatMap((r) => r.actions)
    .find((a) => a.type === "send_message");
  const t =
    templateId && templateId.type === "send_message"
      ? entry.modules.messages?.templates.find((x) => x.id === templateId.templateId)
      : null;
  const fill = (s: string) =>
    s.replace(/\{(\w+)\}/g, (m, k: string) =>
      k === "name"
        ? name || "there"
        : k === "opportunity"
          ? p.opportunity.title
          : k === "decides_by"
            ? p.cohort?.decidesBy
              ? fmtDay(p.cohort.decidesBy, p.timezone)
              : "the decision date"
            : m,
    );
  await candidateEmail(ws, p.opportunity, {
    to: email,
    subject: t ? fill(t.subject) : EMAIL.received(p.opportunity.title),
    body: t
      ? fill(t.body)
      : `Hi ${name || "there"},\n\nThank you for applying to ${p.opportunity.title}. We'll email you at each step.`,
    cta: { href: statusUrl, label: COPY.statusButton },
    applicationId: app.id,
  });
}

/* ---------------- Emails ---------------- */

/**
 * An email to a candidate: from the opportunity's sender name, replies to its reply-to, with the
 * status link as the button (every candidate email carries it). Never answers or documents.
 */
async function candidateEmail(
  ws: Workspace,
  opp: Pick<Opportunity, "title" | "settings">,
  m: {
    to: string;
    subject: string;
    body: string;
    cta?: { href: string; label: string };
    applicationId?: string;
  },
) {
  const [{ letterMail }, { brandFor }] = await Promise.all([
    import("@/emails/booking"),
    import("@/emails/brand"),
  ]);
  const sender = opp.settings.senderName || ws.name;
  const mail = await letterMail({
    brand: brandFor(ws),
    subject: m.subject,
    body: m.body,
    signedBy: sender,
    cta: m.cta,
  });
  await sendEmail({
    to: m.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    fromName: sender,
    ...(opp.settings.replyTo ? { replyTo: opp.settings.replyTo } : {}),
  });
}

/** A fresh status link (the old one stops working) by email, valid for 30 days. */
async function resendStatusLink(
  ws: Workspace,
  opp: Pick<Opportunity, "title" | "settings">,
  app: Pick<Application, "id">,
  email: string,
) {
  const token = newToken();
  await db()
    .update(schema.applications)
    .set({
      statusTokenHash: hash(token),
      statusTokenExpiresAt: new Date(Date.now() + days(LINK_DAYS)),
    })
    .where(eq(schema.applications.id, app.id));
  await candidateEmail(ws, opp, {
    to: email,
    subject: EMAIL.link(opp.title),
    body: `Here's your link to ${opp.title}. Use it to check where your application stands.`,
    cta: { href: `${await publicBaseUrl(ws)}/applications/${token}`, label: COPY.statusButton },
  });
}

/** Coordinators of an opportunity (team role), for in-app news about its applications. */
async function tellCoordinators(
  ws: Pick<Workspace, "id" | "slug" | "settings">,
  opp: Pick<Opportunity, "id">,
  n: { title: string; body: string; dedupeKey: string },
) {
  const team = await db()
    .select({ userId: schema.opportunityMembers.userId })
    .from(schema.opportunityMembers)
    .where(
      and(
        eq(schema.opportunityMembers.opportunityId, opp.id),
        eq(schema.opportunityMembers.role, "coordinator"),
      ),
    );
  await Promise.all(
    team.map((m) =>
      notify(ws, m.userId, {
        kind: "application.submitted",
        title: n.title,
        body: n.body,
        link: `/admin/hiring/opportunities/${opp.id}`,
        dedupeKey: `${n.dedupeKey}:${m.userId}`,
      }),
    ),
  );
}

/* ---------------- The status page ---------------- */

export type StatusView =
  | { kind: "missing" }
  | { kind: "expired" }
  | { kind: "deleted" }
  | { kind: "ok"; view: Awaited<ReturnType<typeof statusView>> };

/** What a status token opens: the application, or why there is nothing to show. */
export async function statusByToken(ws: Workspace, token: string): Promise<StatusView> {
  if (!token || token.length > 100) return { kind: "missing" };
  const h = hash(token);
  const [app] = await db()
    .select()
    .from(schema.applications)
    .where(
      and(eq(schema.applications.workspaceId, ws.id), eq(schema.applications.statusTokenHash, h)),
    );
  if (!app) {
    const gone = await db().query.dataRequests.findFirst({
      where: and(
        eq(schema.dataRequests.workspaceId, ws.id),
        eq(schema.dataRequests.statusTokenHash, h),
      ),
      columns: { status: true },
    });
    return gone?.status === "completed" ? { kind: "deleted" } : { kind: "missing" };
  }
  if (app.statusTokenExpiresAt && app.statusTokenExpiresAt < new Date()) return { kind: "expired" };
  return { kind: "ok", view: await statusView(ws, app) };
}

async function statusView(ws: Workspace, app: Application) {
  const [opp, cohort, stage, response, reviews, request] = await Promise.all([
    db().query.opportunities.findFirst({ where: eq(schema.opportunities.id, app.opportunityId) }),
    db().query.opportunityCohorts.findFirst({
      where: eq(schema.opportunityCohorts.id, app.cohortId),
    }),
    app.stageId
      ? db().query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.id, app.stageId) })
      : null,
    app.formResponseId
      ? db().query.formResponses.findFirst({
          where: eq(schema.formResponses.id, app.formResponseId),
        })
      : null,
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reviews)
      .where(and(eq(schema.reviews.applicationId, app.id), eq(schema.reviews.status, "submitted"))),
    db().query.dataRequests.findFirst({
      where: and(
        eq(schema.dataRequests.applicationId, app.id),
        ne(schema.dataRequests.status, "completed"),
      ),
    }),
  ]);
  const tz = opp!.settings.timezone ?? ws.timezone;
  const form = response
    ? await db().query.formVersions.findFirst({
        where: eq(schema.formVersions.id, response.formVersionId),
      })
    : null;
  const files = response
    ? await db()
        .select({ id: schema.files.id, name: schema.files.name, sourceId: schema.files.sourceId })
        .from(schema.files)
        .where(
          and(
            eq(schema.files.ownerType, "form_response"),
            eq(schema.files.ownerId, response.id),
            isNull(schema.files.deletedAt),
          ),
        )
    : [];
  const s: Pick<SetupStage, "label" | "category" | "isEntry" | "isWaitlist"> = stage
    ? {
        label: opp!.settings.statusLabels?.[stage.key] ?? null,
        category: stage.category,
        isEntry: stage.isEntry,
        isWaitlist: stage.isWaitlist,
      }
    : { label: null, category: "open", isEntry: true, isWaitlist: false };
  const window = applicationWindow({
    status: opp!.status,
    opensAt: cohort?.opensAt ?? null,
    closesAt: cohort?.closesAt ?? null,
    graceMinutes: closeGraceMinutes(opp!.settings),
  });
  return {
    application: app,
    opportunity: opp!,
    cohort,
    timezone: tz,
    label: candidateLabel(s),
    category: s.category,
    isEntry: s.isEntry,
    isWaitlist: s.isWaitlist,
    // A final stage shows only after the team releases the decision (H5); until then it reads
    // as "Under review", which is true.
    released: !isFinal(s.category),
    form: form?.schema ?? null,
    answers: (response?.answers ?? {}) as Answers,
    files,
    revision: response?.revision ?? 1,
    editable: mayEdit({
      state: app.state,
      isEntry: s.isEntry,
      submittedReviews: reviews[0]?.n ?? 0,
      window,
    }),
    window,
    accommodations: await readOwnAccommodations(app),
    email: maskEmail((await emailOf(app)) ?? ""),
    request: request ?? null,
  };
}

/** Each status-page action goes through its token; a mismatch says nothing about others. */
async function byToken(ws: Workspace, token: string) {
  const r = await statusByToken(ws, token);
  if (r.kind !== "ok") throw new ApplyError(COPY.expired, 404);
  return r.view;
}

/* ---------------- Withdraw and delete ---------------- */

/**
 * Withdraws an application: its interviews still to come are cancelled (the hosts are told),
 * the coordinators hear about it and the candidate gets a confirmation. Can't be undone by the
 * candidate. Returns quietly when it is already withdrawn.
 */
export async function withdraw(
  ws: Workspace,
  token: string,
  reason: string | null,
  opts: { quiet?: boolean } = {},
) {
  const v = await byToken(ws, token);
  if (v.application.state !== "active") return v.application;
  const now = new Date();
  const [app] = await db()
    .update(schema.applications)
    .set({ state: "withdrawn", withdrawnAt: now, lastActivityAt: now })
    .where(
      and(eq(schema.applications.id, v.application.id), eq(schema.applications.state, "active")),
    )
    .returning();
  if (!app) return v.application;
  const upcoming = await db()
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.applicationId, app.id),
        gt(schema.bookings.startAt, now),
        inArray(schema.bookings.status, ["confirmed", "pending", "awaiting_payment"]),
      ),
    );
  if (upcoming.length) {
    const { cancelBooking } = await import("../booking-flow");
    for (const b of upcoming) await cancelBooking(ws, b.id, "attendee", "The applicant withdrew.");
  }
  await audit({
    workspace: ws.id,
    action: "application.withdrawn",
    target: { type: "application", id: app.id, label: v.opportunity.title },
    actor: CANDIDATE,
    changes: { reason: { to: reason?.slice(0, 500) ?? null } },
  });
  emitEvent(ws.id, "application.withdrawn", {
    id: app.id,
    opportunityId: app.opportunityId,
    withdrawnAt: now.toISOString(),
  });
  await tellCoordinators(ws, v.opportunity, {
    title: `An applicant withdrew from ${v.opportunity.title}`,
    body: reason?.slice(0, 200) || "No reason given.",
    dedupeKey: `application.withdrawn:${app.id}`,
  });
  if (!opts.quiet) {
    const email = await emailOf(app);
    if (email)
      await candidateEmail(ws, v.opportunity, {
        to: email,
        subject: EMAIL.withdrawn(v.opportunity.title),
        body: `You've withdrawn your application to ${v.opportunity.title}. The team has stopped reviewing it.`,
        cta: { href: `${await publicBaseUrl(ws)}/applications/${token}`, label: COPY.statusButton },
      });
  }
  refreshWorkspace(ws.id);
  return app;
}

async function emailOf(app: Pick<Application, "contactId">) {
  const c = await db().query.contacts.findFirst({
    where: eq(schema.contacts.id, app.contactId),
    columns: { email: true },
  });
  return c?.email ?? null;
}

/**
 * A deletion request (decided Q5): withdraws at once, queues the request for the coordinators
 * with the 30-day deadline and sends the candidate a receipt with the latest deletion date.
 */
export async function requestDeletion(ws: Workspace, token: string) {
  const v = await byToken(ws, token);
  if (v.request) return v.request;
  const email = await emailOf(v.application);
  await withdraw(ws, token, "Asked for their application to be deleted.", { quiet: true });
  const now = new Date();
  const due = new Date(now.getTime() + days(DELETION_DAYS));
  const [row] = await db()
    .insert(schema.dataRequests)
    .values({
      workspaceId: ws.id,
      applicationId: v.application.id,
      opportunityId: v.opportunity.id,
      contactEmail: email ?? "",
      statusTokenHash: hash(token),
      requestedAt: now,
      dueAt: due,
    })
    .returning();
  await audit({
    workspace: ws.id,
    action: "application.deletion_requested",
    target: { type: "application", id: v.application.id, label: v.opportunity.title },
    actor: CANDIDATE,
    changes: { dueAt: { to: due.toISOString() } },
  });
  if (email) {
    const by = fmtDay(due, v.timezone);
    await candidateEmail(ws, v.opportunity, {
      to: email,
      subject: EMAIL.deletionReceipt(v.opportunity.title, by),
      body: `We received your request on ${fmtDay(now, v.timezone)} to delete your application to ${v.opportunity.title}. It has been withdrawn, and we'll delete your answers and documents by ${by}. We'll email you when it's done.`,
      cta: { href: `${await publicBaseUrl(ws)}/applications/${token}`, label: COPY.statusButton },
    });
    await db()
      .update(schema.dataRequests)
      .set({ receiptSentAt: new Date() })
      .where(eq(schema.dataRequests.id, row!.id));
  }
  await tellCoordinators(ws, v.opportunity, {
    title: `Deletion request for ${v.opportunity.title}`,
    body: `${DELETION_DAYS} days left`,
    dedupeKey: `data_request:${row!.id}`,
  });
  return row!;
}

/** Everything the candidate sent, as data they can keep (answers, file names, dates). */
export async function exportOwnData(ws: Workspace, token: string) {
  const v = await byToken(ws, token);
  const labels = new Map((v.form?.fields ?? []).map((f) => [f.id, f.label]));
  return {
    opportunity: v.opportunity.title,
    submittedAt: v.application.submittedAt?.toISOString() ?? null,
    status: v.application.state === "withdrawn" ? "Withdrawn" : v.label,
    answers: Object.fromEntries(
      Object.entries(v.answers)
        .filter(([, a]) => a !== null && a !== "")
        .map(([k, a]) => [
          labels.get(k) ?? k,
          a && typeof a === "object" && "fileIds" in a
            ? v.files.filter((f) => a.fileIds.includes(f.id)).map((f) => f.name)
            : a,
        ]),
    ),
    accommodations: v.accommodations,
    futureContact: v.application.futureContact,
    privacyNoticeVersion: v.application.privacyVersion,
  };
}

/** The candidate updates their adjustments request (coordinators only ever read it). */
export async function updateAccommodations(ws: Workspace, token: string, text: string) {
  const v = await byToken(ws, token);
  if (v.application.state !== "active") throw new ApplyError("This application is closed.");
  if (text.length > 4000) throw new ApplyError("Keep it under 4,000 characters.");
  await writeSensitive(v.application, { accommodations: text });
  await audit({
    workspace: ws.id,
    action: "application.accommodations_changed",
    target: { type: "application", id: v.application.id, label: v.opportunity.title },
    actor: CANDIDATE,
  });
}

/* ---------------- Editing a submitted application (ADR 0003) ---------------- */

/**
 * Saves the candidate's changes as a new revision of their response (the previous one stays).
 * Only while the application is new; files may be kept from the current revision or uploaded
 * with the edit's own draft token.
 */
export async function saveEdit(
  ws: Workspace,
  token: string,
  input: { draftToken: string | null; answers: Record<string, unknown> },
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  const v = await byToken(ws, token);
  if (!v.editable || !v.form || !v.application.formResponseId)
    throw new ApplyError(COPY.editLocked, 409);
  const current = await db().query.formResponses.findFirst({
    where: eq(schema.formResponses.id, v.application.formResponseId),
  });
  const published = await publishedSchema(ws.id, current!.formId);
  if (!published) throw new ApplyError(COPY.unavailable, 404);
  const checked = validateResponse(published.schema, input.answers);
  const answers: Answers = checked.answers;
  const errors: Record<string, string> = Object.fromEntries(
    checked.errors.map((e) => [e.fieldId, e.message]),
  );
  if (Object.keys(errors).length) return { ok: false, errors };
  // The email that identifies the applicant can't change here (it's who the link belongs to).
  const ids = identityFields(published.schema);
  if (ids.email)
    answers[ids.email.id] = (v.answers[ids.email.id] ?? answers[ids.email.id]) as never;
  const draft = input.draftToken
    ? await draftResponse(ws.id, current!.formId, input.draftToken)
    : null;
  // Files: this revision's own uploads, or ones the current revision already has.
  const kept = new Set(v.files.map((f) => f.id));
  const fresh: Answers = { ...answers };
  for (const f of published.schema.fields) {
    const a = answers[f.id];
    if (f.type !== "file" || !a || typeof a !== "object" || !("fileIds" in a)) continue;
    fresh[f.id] = { fileIds: a.fileIds.filter((id) => !kept.has(id)) };
  }
  const problem = await checkFileAnswers(ws.id, published.schema, fresh, draft);
  if (problem) return { ok: false, errors: { files: problem } };
  const now = new Date();
  const row = await db().transaction(async (tx) => {
    const values = {
      workspaceId: ws.id,
      formId: current!.formId,
      formVersionId: published.versionId,
      contactId: current!.contactId,
      applicationId: v.application.id,
      answers,
      status: "submitted" as const,
      submittedAt: now,
      revision: current!.revision + 1,
      supersedesId: current!.id,
      resumeTokenHash: null,
    };
    let id: string;
    if (draft) {
      await tx
        .update(schema.formResponses)
        .set(values)
        .where(eq(schema.formResponses.id, draft.id));
      id = draft.id;
    } else {
      const [r] = await tx
        .insert(schema.formResponses)
        .values(values)
        .returning({ id: schema.formResponses.id });
      id = r!.id;
    }
    // Files kept from the previous revision move with the application's current answers.
    const keptIds = Object.values(answers).flatMap((a) =>
      a && typeof a === "object" && "fileIds" in a ? a.fileIds.filter((x) => kept.has(x)) : [],
    );
    if (keptIds.length)
      await tx
        .update(schema.files)
        .set({ ownerId: id })
        .where(and(eq(schema.files.ownerType, "form_response"), inArray(schema.files.id, keptIds)));
    await tx
      .update(schema.applications)
      .set({ formResponseId: id, lastActivityAt: now })
      .where(eq(schema.applications.id, v.application.id));
    return id;
  });
  await audit({
    workspace: ws.id,
    action: "application.edited",
    target: { type: "application", id: v.application.id, label: v.opportunity.title },
    actor: CANDIDATE,
    changes: {
      revision: { from: current!.revision, to: current!.revision + 1 },
      response: { to: row },
    },
  });
  const email = await emailOf(v.application);
  if (email)
    await candidateEmail(ws, v.opportunity, {
      to: email,
      subject: EMAIL.updated(v.opportunity.title),
      body: `We've saved the changes to your application to ${v.opportunity.title}. Your earlier answers are kept, too.`,
      cta: { href: `${await publicBaseUrl(ws)}/applications/${token}`, label: COPY.statusButton },
    });
  refreshWorkspace(ws.id);
  return { ok: true };
}

/* ---------------- Link recovery ---------------- */

/**
 * New links for every application with this email in the workspace. The same answer whether or
 * not there is one (no enumeration); 3 requests an hour per email, 10 per visitor.
 */
export async function recoverLinks(
  ws: Workspace,
  rawEmail: string,
  ip: string,
): Promise<"sent" | "limited"> {
  const email = rawEmail.trim().toLowerCase();
  const [byEmail, byIp] = await Promise.all([
    rateLimit(`apply-recover:${email}`, 3, 3600_000),
    rateLimit(`apply-recover-ip:${ip}`, 10, 3600_000),
  ]);
  if (!byEmail.ok || !byIp.ok) return "limited";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "sent";
  const rows = await db()
    .select({ application: schema.applications, opportunity: schema.opportunities })
    .from(schema.applications)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.applications.contactId))
    .innerJoin(schema.opportunities, eq(schema.opportunities.id, schema.applications.opportunityId))
    .where(
      and(
        eq(schema.applications.workspaceId, ws.id),
        eq(schema.contacts.email, email),
        ne(schema.applications.state, "draft"),
      ),
    )
    .orderBy(desc(schema.applications.submittedAt))
    .limit(10);
  for (const r of rows) await resendStatusLink(ws, r.opportunity, r.application, email);
  return "sent";
}

/* ---------------- The team: drafts, data requests ---------------- */

/** How many people started an application and haven't sent it ("12 started, not submitted"). */
export async function draftCount(actor: Actor, opportunityId: string): Promise<number> {
  assertOnOpportunity(actor, opportunityId, "opportunity.view");
  const [opp] = await db()
    .select({ formId: schema.opportunities.formId })
    .from(schema.opportunities)
    .where(
      and(
        eq(schema.opportunities.id, opportunityId),
        eq(schema.opportunities.workspaceId, actor.workspaceId),
      ),
    );
  if (!opp?.formId) return 0;
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.formResponses)
    .where(
      and(eq(schema.formResponses.formId, opp.formId), eq(schema.formResponses.status, "draft")),
    );
  return r?.n ?? 0;
}

/** The opportunity's open and held deletion requests, oldest deadline first, for coordinators. */
export async function listDataRequests(actor: Actor, opportunityId: string) {
  assertOnOpportunity(actor, opportunityId, "opportunity.configure");
  return db()
    .select()
    .from(schema.dataRequests)
    .where(
      and(
        eq(schema.dataRequests.workspaceId, actor.workspaceId),
        eq(schema.dataRequests.opportunityId, opportunityId),
        ne(schema.dataRequests.status, "completed"),
      ),
    )
    .orderBy(asc(schema.dataRequests.dueAt));
}

async function requestFor(actor: Actor, requestId: string) {
  const r = await db().query.dataRequests.findFirst({
    where: and(
      eq(schema.dataRequests.id, requestId),
      eq(schema.dataRequests.workspaceId, actor.workspaceId),
    ),
  });
  if (!r?.opportunityId) throw new ApplyError("That request is gone.", 404);
  assertOnOpportunity(actor, r.opportunityId, "opportunity.configure");
  return r;
}

/** "Delete now": runs the deletion for one request. */
export async function deleteNow(actor: Actor, ws: Workspace, requestId: string) {
  const r = await requestFor(actor, requestId);
  if (r.status === "completed") return;
  await completeDeletion(ws, r, { type: "user", id: actor.userId, label: "Coordinator" });
}

/** A legal hold: the data is kept, with the reason, and the candidate is told why. */
export async function recordLegalHold(
  actor: Actor,
  ws: Workspace,
  requestId: string,
  reason: string,
) {
  const r = await requestFor(actor, requestId);
  const why = reason.trim();
  if (!why) throw new ApplyError("Say why the application has to be kept.");
  if (why.length > 500) throw new ApplyError("Keep the reason under 500 characters.");
  if (r.status === "completed") throw new ApplyError("That application is already deleted.");
  await db()
    .update(schema.dataRequests)
    .set({ status: "held", holdReason: why, heldBy: actor.userId, heldAt: new Date() })
    .where(eq(schema.dataRequests.id, r.id));
  await audit({
    workspace: ws.id,
    action: "application.legal_hold_recorded",
    target: { type: "application", id: r.applicationId },
    changes: { reason: { to: why } },
  });
  const opp = r.opportunityId
    ? await db().query.opportunities.findFirst({
        where: eq(schema.opportunities.id, r.opportunityId),
      })
    : null;
  if (opp && r.contactEmail)
    await candidateEmail(ws, opp, {
      to: r.contactEmail,
      subject: EMAIL.legalHold(opp.title),
      body: COPY.legalHold(opp.settings.senderName || ws.name, why),
    });
  refreshWorkspace(ws.id);
}

/**
 * Deletes an application and what only it held: answers (every revision), documents, the
 * sensitive row, reviews and decisions, its timeline entries and interviews, and the person
 * when they exist only as this candidate. The request row stays, with just the email, as the
 * record that the request was honoured.
 */
async function completeDeletion(
  ws: Workspace,
  r: typeof schema.dataRequests.$inferSelect,
  actor: AuditActor,
) {
  const app = r.applicationId
    ? await db().query.applications.findFirst({
        where: eq(schema.applications.id, r.applicationId),
      })
    : null;
  if (app) {
    const responses = await db()
      .select({ id: schema.formResponses.id })
      .from(schema.formResponses)
      .where(eq(schema.formResponses.applicationId, app.id));
    const files = responses.length
      ? await db()
          .select()
          .from(schema.files)
          .where(
            and(
              eq(schema.files.ownerType, "form_response"),
              inArray(
                schema.files.ownerId,
                responses.map((x) => x.id),
              ),
            ),
          )
      : [];
    for (const f of files) await removeFile(f, { silent: true });
    await db().transaction(async (tx) => {
      await tx.delete(schema.bookings).where(eq(schema.bookings.applicationId, app.id));
      await tx.delete(schema.contactEvents).where(eq(schema.contactEvents.applicationId, app.id));
      await tx
        .delete(schema.stageTransitions)
        .where(
          and(
            eq(schema.stageTransitions.subjectType, "application"),
            eq(schema.stageTransitions.subjectId, app.id),
          ),
        );
      await tx.delete(schema.applications).where(eq(schema.applications.id, app.id));
      // The person goes too when this was all they were: no client stage, nothing else here.
      await tx.execute(sql`
        delete from ${schema.contacts} c
        where c.id = ${app.contactId} and c.stage_id is null
          and not exists (select 1 from ${schema.applications} a where a.contact_id = c.id)
          and not exists (select 1 from ${schema.bookings} b where b.contact_id = c.id)
      `);
    });
  }
  const now = new Date();
  await db()
    .update(schema.dataRequests)
    .set({
      status: "completed",
      completedAt: now,
      completedBy: actor.type === "user" ? (actor.id ?? null) : null,
    })
    .where(eq(schema.dataRequests.id, r.id));
  await audit({
    workspace: ws.id,
    action: "application.deleted",
    target: { type: "application", id: r.applicationId },
    actor,
    changes: { by: { to: actor.type === "user" ? "coordinator" : "automatic" } },
  });
  const opp = r.opportunityId
    ? await db().query.opportunities.findFirst({
        where: eq(schema.opportunities.id, r.opportunityId),
      })
    : null;
  if (r.contactEmail)
    await candidateEmail(ws, opp ?? { title: ws.name, settings: {} }, {
      to: r.contactEmail,
      subject: EMAIL.deleted(opp?.title ?? ws.name),
      body: `Your application${opp ? ` to ${opp.title}` : ""} and the documents you sent have been deleted, as you asked.`,
    });
  refreshWorkspace(ws.id);
}

/**
 * The deletion queue's clock (runs with the reminders tick): coordinators are reminded at day 7
 * and day 21, and open requests are carried out at their deadline unless a hold is recorded.
 */
export async function sweepDataRequests(now = new Date()): Promise<number> {
  const open = await db()
    .select()
    .from(schema.dataRequests)
    .where(and(eq(schema.dataRequests.status, "open"), isNull(schema.dataRequests.completedAt)));
  let n = 0;
  for (const r of open) {
    const ws = await db().query.workspaces.findFirst({
      where: eq(schema.workspaces.id, r.workspaceId),
    });
    if (!ws) continue;
    if (r.dueAt <= now) {
      await completeDeletion(ws, r, { type: "system", label: "Deletion deadline" });
      n++;
      continue;
    }
    const age = Math.floor((now.getTime() - r.requestedAt.getTime()) / 86_400_000);
    for (const mark of ["d7", "d21"] as const) {
      if (age < Number(mark.slice(1)) || r.remindersSent.includes(mark)) continue;
      const left = Math.ceil((r.dueAt.getTime() - now.getTime()) / 86_400_000);
      if (r.opportunityId)
        await tellCoordinators(
          ws,
          { id: r.opportunityId },
          {
            title: "A deletion request is waiting",
            body: `${left} days left`,
            dedupeKey: `data_request:${r.id}:${mark}`,
          },
        );
      await db()
        .update(schema.dataRequests)
        .set({ remindersSent: [...r.remindersSent, mark] })
        .where(eq(schema.dataRequests.id, r.id));
      n++;
    }
  }
  return n;
}

export const applyWindow = (
  p: NonNullable<PublicOpportunity>,
  draftStartedAt?: Date | null,
): Window => windowOf(p, draftStartedAt);
