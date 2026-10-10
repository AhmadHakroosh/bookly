"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { refreshWorkspace } from "@/server/cache";
import { parseQuestionsJson } from "@/server/questions";
import { parseDestination, parseRulesJson } from "@/server/routing-rules";
import { listAllEventTypes } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function ctx() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) throw new Error("No workspace");
  return { session, ws };
}
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export async function createRoutingForm() {
  const { ws } = await ctx();
  const id = crypto.randomUUID();
  await db()
    .insert(schema.routingForms)
    .values({ id, workspaceId: ws.id, slug: `form-${id.slice(0, 4)}`, name: "New routing form" });
  await audit({
    action: "routing_form.created",
    target: { type: "routing_form", id, label: "New routing form" },
  });
  redirect(`/admin/routing/${id}`);
}

const formSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(48).default(""),
  description: z.string().trim().max(2000).default(""),
  questionsJson: z.string().max(20000).default(""),
  rulesJson: z.string().max(40000).default(""),
  fallbackJson: z.string().max(4000).default(""),
  active: z.enum(["on", "off"]).default("off"),
});

export type RoutingSaveState = { ok?: boolean; error?: string };

export async function saveRoutingForm(
  _prev: RoutingSaveState,
  formData: FormData,
): Promise<RoutingSaveState> {
  const { ws } = await ctx();
  const parsed = formSchema.safeParse({
    ...Object.fromEntries(formData),
    active: formData.get("active") ? "on" : "off",
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const existing = await db().query.routingForms.findFirst({
    where: and(eq(schema.routingForms.id, d.id), eq(schema.routingForms.workspaceId, ws.id)),
  });
  if (!existing) return { error: "Form not found" };
  let slug = slugify(d.slug) || slugify(d.name) || "form";
  const clash = await db().query.routingForms.findFirst({
    where: and(eq(schema.routingForms.workspaceId, ws.id), eq(schema.routingForms.slug, slug)),
    columns: { id: true },
  });
  if (clash && clash.id !== d.id) slug = `${slug}-${d.id.slice(0, 4)}`;
  const known = new Set((await listAllEventTypes(ws.id)).map((e) => e.id));
  let fallback = null;
  if (d.fallbackJson.trim()) {
    try {
      fallback = parseDestination(JSON.parse(d.fallbackJson), known);
    } catch {
      fallback = null;
    }
  }
  const patch = {
    name: d.name,
    slug,
    description: d.description || null,
    questions: parseQuestionsJson(d.questionsJson),
    rules: parseRulesJson(d.rulesJson, known),
    fallback,
    active: d.active === "on",
  };
  await db().update(schema.routingForms).set(patch).where(eq(schema.routingForms.id, d.id));
  await audit({
    action: "routing_form.updated",
    target: { type: "routing_form", id: d.id, label: d.name },
    changes: {
      ...diff(existing, patch, ["name", "slug", "description", "active"]),
      ...diff(
        { questions: existing.questions.length, rules: existing.rules.length },
        { questions: patch.questions.length, rules: patch.rules.length },
      ),
    },
  });
  refreshWorkspace(ws.id);
  return { ok: true };
}

export async function deleteRoutingForm(id: string) {
  const { ws } = await ctx();
  const [gone] = await db()
    .delete(schema.routingForms)
    .where(and(eq(schema.routingForms.id, id), eq(schema.routingForms.workspaceId, ws.id)))
    .returning({ name: schema.routingForms.name });
  if (gone)
    await audit({
      action: "routing_form.deleted",
      target: { type: "routing_form", id, label: gone.name },
    });
  refreshWorkspace(ws.id);
  redirect("/admin/routing");
}
