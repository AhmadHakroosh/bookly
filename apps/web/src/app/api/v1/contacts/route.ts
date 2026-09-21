import { z } from "zod";
import { CONTACT_STAGES, type ContactStage } from "@bookly/db/schema";
import { apiContext, apiError, json, options, readJson, serializeContact } from "@/server/api";
import {
  getContactByEmail,
  listContacts,
  setStage,
  updateContact,
  upsertContact,
} from "@/server/contacts";

export const OPTIONS = options;

/** GET /api/v1/contacts?q=&stage=&limit= (scope bookings:read) */
export async function GET(req: Request) {
  const ctx = await apiContext(req, "bookings:read");
  if (ctx instanceof Response) return ctx;
  const q = new URL(req.url).searchParams;
  const stage = q.get("stage");
  const rows = await listContacts(ctx.workspace.id, {
    q: q.get("q") ?? undefined,
    stage:
      stage && (CONTACT_STAGES as readonly string[]).includes(stage)
        ? (stage as ContactStage)
        : undefined,
    limit: Math.min(500, Math.max(1, Number(q.get("limit")) || 100)),
  });
  return json(rows.map(serializeContact), { meta: { total: rows.length } });
}

const upsertSchema = z.object({
  email: z.email(),
  name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  stage: z.enum(CONTACT_STAGES).optional(),
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
  const c = await upsertContact(ctx.workspace.id, d);
  const patch: Parameters<typeof updateContact>[2] = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.company !== undefined) patch.company = d.company || null;
  if (d.phone !== undefined) patch.phone = d.phone || null;
  if (d.tags !== undefined) patch.tags = d.tags;
  if (d.notes !== undefined) patch.notes = d.notes || null;
  if (Object.keys(patch).length) await updateContact(ctx.workspace.id, c.id, patch);
  if (d.stage) await setStage(ctx.workspace.id, c.id, d.stage, "api");
  const fresh = await getContactByEmail(ctx.workspace.id, d.email);
  return json(serializeContact(fresh ?? c), { status: 201 });
}
