import { z } from "zod";
import { apiContext, apiError, json, options, readJson, serializeContact } from "@/server/api";
import { API_KEY_ACTOR, SYSTEM_ACTOR, audit, diff } from "@/server/audit";
import {
  getContactByEmail,
  listContacts,
  setStage,
  updateContact,
  upsertContact,
} from "@/server/contacts";
import { clientStages } from "@/server/pipelines";

export const OPTIONS = options;

/**
 * GET /api/v1/contacts?q=&stage=&stageId=&limit= (scope bookings:read). `stage` is a stage key
 * of the client pipeline (lead, active, won, lost or the workspace's own).
 */
export async function GET(req: Request) {
  const ctx = await apiContext(req, "bookings:read");
  if (ctx instanceof Response) return ctx;
  const q = new URL(req.url).searchParams;
  const stages = await clientStages(ctx.workspace.id);
  const byId = new Map(stages.map((s) => [s.id, s]));
  const wanted = q.get("stageId") ? byId.get(q.get("stageId")!)?.key : q.get("stage");
  if ((q.get("stage") || q.get("stageId")) && !stages.some((s) => s.key === wanted))
    return apiError("Unknown stage", 400, "bad_request");
  const rows = await listContacts(ctx.workspace.id, {
    q: q.get("q") ?? undefined,
    stage: wanted ?? undefined,
    limit: Math.min(500, Math.max(1, Number(q.get("limit")) || 100)),
  });
  return json(
    rows.map((c) => serializeContact(c, c.stageId ? (byId.get(c.stageId) ?? null) : null)),
    { meta: { total: rows.length } },
  );
}

const upsertSchema = z.object({
  email: z.email(),
  name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  /** A stage key of the client pipeline; or `stageId`. */
  stage: z.string().trim().min(1).max(40).optional(),
  stageId: z.string().min(1).max(64).optional(),
  notes: z.string().max(10000).optional(),
});

/** POST /api/v1/contacts (scope bookings:write) — creates or updates a contact by email. */
export async function POST(req: Request) {
  const ctx = await apiContext(req, "bookings:write");
  if (ctx instanceof Response) return ctx;
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success)
    return apiError(parsed.error.issues[0]?.message ?? "Invalid body", 400, "bad_request");
  const d = parsed.data;
  const stages = await clientStages(ctx.workspace.id);
  const target = d.stageId
    ? stages.find((s) => s.id === d.stageId)
    : d.stage
      ? stages.find((s) => s.key === d.stage)
      : undefined;
  if ((d.stage || d.stageId) && !target) return apiError("Unknown stage", 400, "bad_request");
  const before = await getContactByEmail(ctx.workspace.id, d.email);
  const c = await upsertContact(ctx.workspace.id, d);
  const patch: Parameters<typeof updateContact>[2] = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.company !== undefined) patch.company = d.company || null;
  if (d.phone !== undefined) patch.phone = d.phone || null;
  if (d.tags !== undefined) patch.tags = d.tags;
  if (d.notes !== undefined) patch.notes = d.notes || null;
  if (Object.keys(patch).length) await updateContact(ctx.workspace.id, c.id, patch);
  if (target) await setStage(ctx.workspace.id, c.id, target.key, "api");
  const fresh = (await getContactByEmail(ctx.workspace.id, d.email)) ?? c;
  await audit({
    action: before ? "contact.updated" : "contact.created",
    target: { type: "contact", id: fresh.id, label: fresh.name || fresh.email },
    actor: ctx.key ? API_KEY_ACTOR(ctx.key) : SYSTEM_ACTOR("api"),
    workspace: ctx.workspace.id,
    changes: diff(before, fresh, ["email", "name", "company", "phone", "tags", "stage"]),
  });
  const stage = fresh.stageId ? (stages.find((s) => s.id === fresh.stageId) ?? null) : null;
  return json(serializeContact(fresh, stage), { status: 201 });
}
