"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { STAGE_CATEGORIES } from "@bookly/db/schema";
import { audit } from "@/server/audit";
import { hasFlag } from "@/server/flags";
import { addStage, archiveStage, moveStage, updateStage } from "@/server/pipelines";
import { refreshWorkspace } from "@/server/cache";
import { deleteRule, saveRule, setRuleActive } from "@/server/pipelines/rules";
import { assertManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

const PAGE = "/admin/settings/pipeline";
const back = (error?: string): never =>
  redirect(error ? `${PAGE}?error=${encodeURIComponent(error)}` : PAGE);

/** Owners and admins, where the `pipelines` flag is on. */
async function ctx() {
  const [{ session, error }, ws] = await Promise.all([assertManager(), getCurrentWorkspace()]);
  if (error || !ws) back(error ?? "No workspace");
  if (!(await hasFlag(ws!, "pipelines"))) back("The pipeline editor isn't on for this workspace.");
  return { ws: ws!, userId: session.user.id };
}

const stageSchema = z.object({
  name: z.string().trim().min(1, "Give the stage a name.").max(60),
  category: z.enum(STAGE_CATEGORIES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
  priority: z.enum(["on"]).optional(),
  entry: z.enum(["on"]).optional(),
});

export async function saveStageAction(id: string, formData: FormData) {
  const { ws } = await ctx();
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(parsed.error.issues[0]?.message);
  const d = parsed.data!;
  const error = await updateStage(ws.id, id, {
    name: d.name,
    category: d.category,
    color: d.color.toLowerCase(),
    priorityScheduling: d.priority === "on",
    ...(d.entry === "on" ? { isEntry: true } : {}),
  });
  if (error) back(error);
  await audit({
    action: "pipeline.stage_updated",
    target: { type: "pipeline_stage", id, label: d.name },
    changes: {
      category: { to: d.category },
      priorityScheduling: { to: d.priority === "on" },
      ...(d.entry === "on" ? { isEntry: { to: true } } : {}),
    },
  });
  back();
}

export async function addStageAction(formData: FormData) {
  const { ws } = await ctx();
  const parsed = stageSchema
    .pick({ name: true, category: true })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(parsed.error.issues[0]?.message);
  const error = await addStage(ws.id, parsed.data!);
  if (error) back(error);
  await audit({
    action: "pipeline.stage_added",
    target: { type: "pipeline_stage", label: parsed.data!.name },
    changes: { category: { to: parsed.data!.category } },
  });
  back();
}

export async function moveStageAction(id: string, dir: "up" | "down") {
  const { ws } = await ctx();
  await moveStage(ws.id, id, dir);
  await audit({
    action: "pipeline.stage_moved",
    target: { type: "pipeline_stage", id },
    changes: { direction: { to: dir } },
  });
  back();
}

export async function archiveStageAction(id: string, formData: FormData) {
  const { ws, userId } = await ctx();
  const moveTo = String(formData.get("moveTo") ?? "") || null;
  const error = await archiveStage(ws.id, id, moveTo, userId);
  if (error) back(error);
  await audit({
    action: "pipeline.stage_archived",
    target: { type: "pipeline_stage", id },
    changes: moveTo ? { movedTo: { to: moveTo } } : {},
  });
  back();
}

/* ---------------- Automations (stage rules, ADR 0002) ---------------- */

const editorAction = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("email"),
    templateId: z.string().max(40).optional(),
    subject: z.string().max(200),
    body: z.string().max(8000),
    transactional: z.boolean(),
  }),
  z.object({
    kind: z.literal("tasks"),
    items: z
      .array(
        z.object({
          title: z.string().max(200),
          dueDays: z.number().int().min(0).max(365).nullable(),
        }),
      )
      .max(30),
  }),
  z.object({ kind: z.literal("booking_link"), eventTypeId: z.string().max(80) }),
  z.object({ kind: z.literal("form"), formId: z.string().max(80) }),
  z.object({
    kind: z.literal("payment"),
    amount: z.number().min(0).max(100_000),
    currency: z.string().length(3),
    description: z.string().max(200),
  }),
  z.object({ kind: z.literal("move"), stageKey: z.string().max(40) }),
  z.object({ kind: z.literal("tag"), tag: z.string().max(40) }),
  z.object({ kind: z.literal("notify"), text: z.string().max(500) }),
]);

const editorRule = z.object({
  name: z.string().max(120),
  on: z.enum(["enter", "leave"]),
  delayHours: z.number().min(0).max(168),
  tag: z.string().max(40),
  actions: z.array(editorAction).max(20),
});

export type RuleSaveState = { problems?: string[]; savedAt?: number };

/** Adds or edits an automation on a stage (with the emails, checklist… it uses). */
export async function saveRuleAction(
  stageId: string,
  ruleId: string | null,
  _prev: RuleSaveState,
  formData: FormData,
): Promise<RuleSaveState> {
  const { ws, userId } = await ruleCtx();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("rule") ?? ""));
  } catch {
    return { problems: ["The automation could not be read. Reload and try again."] };
  }
  const parsed = editorRule.safeParse(raw);
  if (!parsed.success)
    return { problems: [parsed.error.issues[0]?.message ?? "Invalid automation."] };
  const r = await saveRule(ws, { stageId, ruleId, draft: parsed.data, userId });
  if ("problems" in r) return { problems: r.problems };
  await audit({
    action: ruleId ? "stage_rule.updated" : "stage_rule.created",
    target: { type: "stage_rule", id: r.id, label: parsed.data.name },
    changes: {
      trigger: { to: parsed.data.on },
      actions: { to: parsed.data.actions.map((a) => a.kind).join(", ") },
    },
  });
  refreshWorkspace(ws.id);
  return { savedAt: Date.now() };
}

export async function toggleRuleAction(ruleId: string, active: boolean) {
  const { ws } = await ruleCtx();
  const error = await setRuleActive(ws, ruleId, active);
  if (error) back(error);
  await audit({
    action: active ? "stage_rule.enabled" : "stage_rule.disabled",
    target: { type: "stage_rule", id: ruleId },
  });
  refreshWorkspace(ws.id);
  back();
}

export async function deleteRuleAction(ruleId: string) {
  const { ws } = await ruleCtx();
  const gone = await deleteRule(ws, ruleId);
  if (gone)
    await audit({
      action: "stage_rule.deleted",
      target: { type: "stage_rule", id: ruleId, label: gone.name },
    });
  refreshWorkspace(ws.id);
  back();
}

/** Owners and admins, where both the pipeline editor and automations are on. */
async function ruleCtx() {
  const c = await ctx();
  if (!(await hasFlag(c.ws, "stage_rules"))) back("Automations aren't on for this workspace.");
  return c;
}
