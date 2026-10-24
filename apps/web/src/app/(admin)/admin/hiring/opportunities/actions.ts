"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { OpportunityRole, RuleAction, StageCategory } from "@bookly/db/schema";
import { OPPORTUNITY_TYPES, STAGE_CATEGORIES } from "@bookly/db/schema";
import { HiringAccessError } from "@/server/access";
import { zonedToUtc } from "@/lib/time";
import { inviteToTeam, removeInvite } from "@/server/hiring/invites";
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
  const { ws, actor } = await ctx();
  if (!isTemplateId(template)) throw new Error("Unknown template.");
  const id = await createFromTemplate(actor, ws, template);
  redirect(setupPath(id, "basics"));
}

export async function copyOpportunityAction(sourceId: string, team: boolean) {
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
  const { actor } = await ctx();
  if (!(STAGE_CATEGORIES as readonly string[]).includes(category))
    return { error: "Choose a category." };
  return attempt(() => addStage(actor, id, { name, category }));
}

export async function updateStageAction(id: string, stageId: string, patch: StagePatch) {
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
  const { actor } = await ctx();
  return attempt(() => reorderStages(actor, id, keys.map(String)));
}

export async function duplicateStageAction(id: string, stageId: string) {
  const { actor } = await ctx();
  return attempt(() => duplicateStage(actor, id, stageId));
}

export async function removeStageAction(id: string, stageId: string, moveTo: string | null) {
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
  const { actor } = await ctx();
  if (!isKind(kind)) return { error: "Unknown module." };
  return attempt(() => saveModule(actor, id, stageId, kind, { enabled }));
}

export async function saveModuleAction(id: string, stageId: string, kind: string, config: unknown) {
  const { actor } = await ctx();
  if (!isKind(kind)) return { error: "Unknown module." };
  return attempt(() => saveModule(actor, id, stageId, kind, { config }));
}

export async function saveMessageAction(id: string, stageId: string, draft: MessageDraft) {
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
  const { actor } = await ctx();
  return attempt(() => deleteMessage(actor, id, stageId, templateId));
}

export async function saveRuleAction(
  id: string,
  stageId: string,
  ruleId: string | null,
  input: { name: string; on: "enter" | "leave"; tag: string; actions: RuleAction[] },
): Promise<{ problems?: string[] }> {
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
  const { actor } = await ctx();
  return attempt(() => deleteHiringRule(actor, id, ruleId));
}

/* ---------------- Team ---------------- */

const ROLES = ["coordinator", "reviewer", "interviewer", "viewer"] as const;

export async function setTeamRoleAction(id: string, userId: string, role: OpportunityRole) {
  const { actor } = await ctx();
  if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
  return attempt(() => setTeamRole(actor, id, userId, role));
}

export async function removeTeamMemberAction(id: string, userId: string) {
  const { actor } = await ctx();
  return attempt(() => removeFromTeam(actor, id, userId));
}

export type InviteState = { error?: string; done?: "member" | "invited"; at?: number };

export async function inviteAction(
  id: string,
  status: "draft" | "open" | "closed" | "archived",
  title: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { ws, actor } = await ctx();
  const role = String(formData.get("role") ?? "reviewer") as OpportunityRole;
  if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
  try {
    const r = await inviteToTeam(
      actor,
      ws,
      { id, status, title },
      String(formData.get("email") ?? ""),
      role,
    );
    return "error" in r ? { error: r.error } : { done: r.added, at: Date.now() };
  } catch (e) {
    if (e instanceof HiringAccessError) return { error: e.message };
    throw e;
  }
}

export async function removeInviteAction(id: string, inviteId: string) {
  const { actor } = await ctx();
  return attempt(() => removeInvite(actor, id, inviteId));
}

/* ---------------- Privacy ---------------- */

export type PrivacyState = { error?: string; savedAt?: number };

export async function savePrivacyAction(
  id: string,
  _prev: PrivacyState,
  formData: FormData,
): Promise<PrivacyState> {
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
  const { actor } = await ctx();
  return attempt(() => closeOpportunity(actor, id));
}

export async function archiveOpportunityAction(
  id: string,
): Promise<{ error?: string; unheard?: number }> {
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
  const { actor } = await ctx();
  const r = await attempt(() => discardDraft(actor, id));
  if (!r.error) redirect("/admin/hiring/opportunities");
  return r;
}
