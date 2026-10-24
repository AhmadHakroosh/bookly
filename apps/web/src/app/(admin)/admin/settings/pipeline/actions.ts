"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { STAGE_CATEGORIES } from "@bookly/db/schema";
import { audit } from "@/server/audit";
import { hasFlag } from "@/server/flags";
import { addStage, archiveStage, moveStage, updateStage } from "@/server/pipelines";
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
