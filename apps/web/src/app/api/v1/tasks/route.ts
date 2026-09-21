import { apiContext, json, options, serializeTask } from "@/server/api";
import { listOpenTasks } from "@/server/capture";

export const OPTIONS = options;

/** GET /api/v1/tasks?contactId=&limit= (scope bookings:read) — open tasks, soonest due first. */
export async function GET(req: Request) {
  const ctx = await apiContext(req, "bookings:read");
  if (ctx instanceof Response) return ctx;
  const q = new URL(req.url).searchParams;
  const rows = await listOpenTasks(ctx.workspace.id, {
    contactId: q.get("contactId") ?? undefined,
    limit: Math.min(500, Math.max(1, Number(q.get("limit")) || 100)),
  });
  return json(rows.map(serializeTask), { meta: { total: rows.length } });
}
