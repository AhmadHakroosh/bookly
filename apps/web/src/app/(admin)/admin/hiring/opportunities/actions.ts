"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { OpportunityRole, RuleAction, StageCategory } from "@bookly/db/schema";
import { OPPORTUNITY_TYPES, STAGE_CATEGORIES } from "@bookly/db/schema";
import { HiringAccessError } from "@/server/access";
import { refreshWorkspace } from "@/server/cache";
import { zonedToUtc } from "@/lib/time";
import { ApplyError, deleteNow, recordLegalHold } from "@/server/hiring/apply";
import { inviteToTeam, removeInvite } from "@/server/hiring/invites";
import {
  clearFlag,
  moveApplications,
  PipelineError,
  showAccommodations,
  type MoveResult,
} from "@/server/hiring/pipeline";
import {
  addStage,
  archiveOpportunity,
  closeOpportunity,
  cloneOpportunity,
  createFromTemplate,
  deleteHiringRule,
  deleteMessage,
  discardDraft,
  duplicateStage,
  publishOpportunity,
  removeStage,
  reorderStages,
  saveBasics,
  saveHiringRule,
  saveMessage,
  saveModule,
  savePrivacy,
  SetupError,
  updateStage,
  type MessageDraft,
  type PublishResult,
  type StagePatch,
} from "@/server/hiring/setup";
import { removeFromTeam, setTeamRole } from "@/server/hiring/team";
import { isTemplateId } from "@/server/hiring/templates";
import { MODULE_KINDS, type ModuleKind } from "@/server/pipelines/modules";
import { hiringContext, opportunityPath, setupPath } from "../context";

/*
 * The opportunity setup wizard's actions. Each resolves the actor and lets the server module
 * check access (ADR 0005) and audit; errors people can fix come back as text.
 */

async function ctx() {
  const c = await hiringContext();
  if (!c) throw new Error("Hiring isn't on for this workspace.");
  return c;
}

/** Runs a setup write and turns access and setup errors into a message. */
async function attempt(fn: () => Promise<string | null | void>): Promise<{ error?: string }> {
  try {
    const r = await fn();
    return r ? { error: r } : {};
  } catch (e) {
    if (e instanceof HiringAccessError || e instanceof SetupError) return { error: e.message };
    throw e;
  }
}

/* ---------------- Create ---------------- */

export async function createOpportunityAction(template: string) {
  // audit: by server/hiring/setup.ts
  const { ws, actor } = await ctx();
  if (!isTemplateId(template)) throw new Error("Unknown template.");
  const id = await createFromTemplate(actor, ws, template);
  redirect(setupPath(id, "basics"));
}

export async function copyOpportunityAction(sourceId: string, team: boolean) {
  // audit: by server/hiring/setup.ts
  const { ws, actor } = await ctx();
  const id = await cloneOpportunity(actor, ws, sourceId, { team });
  redirect(setupPath(id, "basics", "copied=1"));
}

/* ---------------- Basics ---------------- */

export type BasicsState = { problems?: Record<string, string>; savedAt?: number };

/** `yyyy-mm-dd` and `HH:MM` in the opportunity's zone → an instant, or null when empty. */
function instant(
  date: FormDataEntryValue | null,
  time: FormDataEntryValue | null,
  tz: string,
  fallback: string,
) {
  const d = String(date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [h, m] = (String(time ?? "").trim() || fallback).split(":").map(Number);
  return zonedToUtc(d, (h ?? 0) * 60 + (m ?? 0), tz);
}

export async function saveBasicsAction(
  id: string,
  _prev: BasicsState,
  formData: FormData,
): Promise<BasicsState> {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  const tz = String(formData.get("timezone") ?? "UTC");
  const type = String(formData.get("type") ?? "custom");
  const seats = String(formData.get("capacity") ?? "").trim();
  const input = {
    title: String(formData.get("title") ?? ""),
    cohortName: String(formData.get("cohortName") ?? ""),
    type: (OPPORTUNITY_TYPES as readonly string[]).includes(type)
      ? (type as (typeof OPPORTUNITY_TYPES)[number])
      : "custom",
    opensAt:
      formData.get("opensNow") === "on"
        ? null
        : instant(formData.get("opensDate"), formData.get("opensTime"), tz, "09:00"),
    closesAt: instant(formData.get("closesDate"), formData.get("closesTime"), tz, "23:59"),
    decidesBy: instant(formData.get("decidesDate"), null, tz, "12:00"),
    capacity: formData.get("noLimit") === "on" || !seats ? null : Number(seats),
    timezone: tz,
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase(),
  };
  try {
    const r = await saveBasics(actor, id, input);
    if (Object.keys(r.problems).length) return { problems: r.problems as Record<string, string> };
  } catch (e) {
    if (e instanceof HiringAccessError || e instanceof SetupError)
      return { problems: { form: e.message } };
    throw e;
  }
  if (formData.get("intent") === "next") redirect(setupPath(id, "stages"));
  return { savedAt: Date.now() };
}

/* ---------------- Stages ---------------- */

export async function addStageAction(id: string, name: string, category: StageCategory) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  if (!(STAGE_CATEGORIES as readonly string[]).includes(category))
    return { error: "Choose a category." };
  return attempt(() => addStage(actor, id, { name, category }));
}

export async function updateStageAction(id: string, stageId: string, patch: StagePatch) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  const parsed = z
    .object({
      name: z.string().max(200).optional(),
      category: z.enum(STAGE_CATEGORIES).optional(),
      label: z.string().max(200).optional(),
      isWaitlist: z.boolean().optional(),
    })
    .safeParse(patch);
  if (!parsed.success) return { error: "Reload and try again." };
  return attempt(() => updateStage(actor, id, stageId, parsed.data));
}

export async function reorderStagesAction(id: string, keys: string[]) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  return attempt(() => reorderStages(actor, id, keys.map(String)));
}

export async function duplicateStageAction(id: string, stageId: string) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  return attempt(() => duplicateStage(actor, id, stageId));
}

export async function removeStageAction(id: string, stageId: string, moveTo: string | null) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  const r = await attempt(() => removeStage(actor, id, stageId, moveTo));
  if (!r.error) redirect(setupPath(id, "stages"));
  return r;
}

/* ---------------- Modules, messages, rules ---------------- */

const isKind = (k: string): k is ModuleKind => (MODULE_KINDS as readonly string[]).includes(k);

export async function toggleModuleAction(
  id: string,
  stageId: string,
  kind: string,
  enabled: boolean,
) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  if (!isKind(kind)) return { error: "Unknown module." };
  return attempt(() => saveModule(actor, id, stageId, kind, { enabled }));
}

export async function saveModuleAction(id: string, stageId: string, kind: string, config: unknown) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  if (!isKind(kind)) return { error: "Unknown module." };
  return attempt(() => saveModule(actor, id, stageId, kind, { config }));
}

export async function saveMessageAction(id: string, stageId: string, draft: MessageDraft) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  const parsed = z
    .object({
      templateId: z.string().max(80).nullable(),
      subject: z.string().max(400),
      body: z.string().max(16_000),
      when: z.enum(["enter", "leave"]),
    })
    .safeParse(draft);
  if (!parsed.success) return { error: "Reload and try again." };
  return attempt(() => saveMessage(actor, id, stageId, parsed.data));
}

export async function deleteMessageAction(id: string, stageId: string, templateId: string) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  return attempt(() => deleteMessage(actor, id, stageId, templateId));
}

export async function saveRuleAction(
  id: string,
  stageId: string,
  ruleId: string | null,
  input: { name: string; on: "enter" | "leave"; tag: string; actions: RuleAction[] },
): Promise<{ problems?: string[] }> {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  try {
    const problems = await saveHiringRule(actor, id, stageId, ruleId, input);
    return problems.length ? { problems } : {};
  } catch (e) {
    if (e instanceof HiringAccessError || e instanceof SetupError) return { problems: [e.message] };
    throw e;
  }
}

export async function deleteRuleAction(id: string, ruleId: string) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  return attempt(() => deleteHiringRule(actor, id, ruleId));
}

/* ---------------- Team ---------------- */

const ROLES = ["coordinator", "reviewer", "interviewer", "viewer"] as const;

export async function setTeamRoleAction(id: string, userId: string, role: OpportunityRole) {
  // audit: by server/hiring/team.ts
  const { ws, actor } = await ctx();
  if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
  const r = await attempt(() => setTeamRole(actor, id, userId, role));
  refreshWorkspace(ws.id);
  return r;
}

export async function removeTeamMemberAction(id: string, userId: string) {
  // audit: by server/hiring/team.ts
  const { ws, actor } = await ctx();
  const r = await attempt(() => removeFromTeam(actor, id, userId));
  refreshWorkspace(ws.id);
  return r;
}

export type InviteState = { error?: string; done?: "member" | "invited"; at?: number };

export async function inviteAction(
  id: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  // audit: by server/hiring/invites.ts
  const { ws, actor } = await ctx();
  const role = String(formData.get("role") ?? "reviewer") as OpportunityRole;
  if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
  try {
    const r = await inviteToTeam(actor, ws, id, String(formData.get("email") ?? ""), role);
    refreshWorkspace(ws.id);
    return "error" in r ? { error: r.error } : { done: r.added, at: Date.now() };
  } catch (e) {
    if (e instanceof HiringAccessError) return { error: e.message };
    throw e;
  }
}

export async function removeInviteAction(id: string, inviteId: string) {
  // audit: by server/hiring/invites.ts
  const { ws, actor } = await ctx();
  const r = await attempt(() => removeInvite(actor, id, inviteId));
  refreshWorkspace(ws.id);
  return r;
}

/* ---------------- Privacy ---------------- */

export type PrivacyState = { error?: string; savedAt?: number };

export async function savePrivacyAction(
  id: string,
  _prev: PrivacyState,
  formData: FormData,
): Promise<PrivacyState> {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  const r = await attempt(() =>
    savePrivacy(actor, id, {
      notice: String(formData.get("notice") ?? ""),
      retentionDays: Number(formData.get("retentionDays") ?? 0),
      accommodations: formData.get("accommodations") === "on",
      senderName: String(formData.get("senderName") ?? ""),
      replyTo: String(formData.get("replyTo") ?? ""),
    }),
  );
  if (r.error) return r;
  if (formData.get("intent") === "next") redirect(setupPath(id, "publish"));
  return { savedAt: Date.now() };
}

/* ---------------- Publish and after ---------------- */

export async function publishAction(
  id: string,
): Promise<PublishResult | { ok: false; reasons: string[] }> {
  // audit: by server/hiring/setup.ts
  const { ws, actor } = await ctx();
  try {
    const r = await publishOpportunity(actor, ws, id);
    if (r.ok) redirect(opportunityPath(id, r.scheduled ? "?published=scheduled" : "?published=1"));
    return r;
  } catch (e) {
    if (e instanceof HiringAccessError || e instanceof SetupError)
      return { ok: false, reasons: [e.message] };
    throw e;
  }
}

export async function closeOpportunityAction(id: string) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  return attempt(() => closeOpportunity(actor, id));
}

export async function archiveOpportunityAction(
  id: string,
): Promise<{ error?: string; unheard?: number }> {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  try {
    const r = await archiveOpportunity(actor, id);
    if (r) return { unheard: r.unheard };
  } catch (e) {
    if (e instanceof HiringAccessError || e instanceof SetupError) return { error: e.message };
    throw e;
  }
  redirect("/admin/hiring/opportunities");
}

export async function discardDraftAction(id: string) {
  // audit: by server/hiring/setup.ts
  const { actor } = await ctx();
  const r = await attempt(() => discardDraft(actor, id));
  if (!r.error) redirect("/admin/hiring/opportunities");
  return r;
}

/* ---------------- The board ---------------- */

/**
 * Moves applications to a stage. Failing exit checks come back for "Move anyway" unless
 * `override`, which is audited per check (ADR 0002).
 */
export async function moveApplicationsAction(
  id: string,
  applicationIds: string[],
  toStageId: string,
  override = false,
): Promise<MoveResult> {
  // audit: by server/hiring/pipeline.ts
  const { ws, actor } = await ctx();
  if (!Array.isArray(applicationIds)) return { ok: false, error: "Choose who to move." };
  try {
    return await moveApplications(
      actor,
      ws,
      String(id),
      applicationIds.map(String),
      String(toStageId),
      { override: override === true },
    );
  } catch (e) {
    if (e instanceof HiringAccessError || e instanceof PipelineError)
      return { ok: false, error: e.message };
    throw e;
  }
}

export async function clearFlagAction(applicationId: string, requirement: string) {
  // audit: by server/hiring/pipeline.ts
  const { actor } = await ctx();
  return attemptApply(() => clearFlag(actor, String(applicationId), String(requirement)));
}

/** The adjustments someone asked for, on a coordinator's click; every read is audited. */
export async function showAccommodationsAction(
  applicationId: string,
): Promise<{ text?: string | null; error?: string }> {
  // audit: by server/hiring/sensitive.ts
  const { actor } = await ctx();
  try {
    return { text: await showAccommodations(actor, String(applicationId)) };
  } catch (e) {
    if (e instanceof HiringAccessError) return { error: e.message };
    throw e;
  }
}

/* ---------------- Data requests ---------------- */

export async function deleteNowAction(requestId: string) {
  // audit: by server/hiring/apply.ts
  const { ws, actor } = await ctx();
  return attemptApply(() => deleteNow(actor, ws, requestId));
}

export async function legalHoldAction(requestId: string, reason: string) {
  // audit: by server/hiring/apply.ts
  const { ws, actor } = await ctx();
  return attemptApply(() => recordLegalHold(actor, ws, requestId, String(reason).slice(0, 600)));
}

async function attemptApply(fn: () => Promise<unknown>): Promise<{ error?: string }> {
  try {
    await fn();
    return {};
  } catch (e) {
    if (e instanceof ApplyError || e instanceof HiringAccessError) return { error: e.message };
    throw e;
  }
}
