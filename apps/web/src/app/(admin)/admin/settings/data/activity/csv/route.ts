import { NextResponse } from "next/server";
import { PLANS, planFor } from "@bookly/cloud";
import { audit, decodeCursor, listActivity, type AuditFilters } from "@/server/audit";
import { hasFeature } from "@/server/limits";
import { getSession, getStaffRole, isManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** Settings → Data → Activity → Download CSV. Streams the filtered log, newest first. */
export async function GET(req: Request) {
  const [session, role, workspace] = await Promise.all([
    getSession(),
    getStaffRole(),
    getCurrentWorkspace(),
  ]);
  if (!session || !workspace) return new NextResponse("Sign in first.", { status: 401 });
  if (!isManager(role)) return new NextResponse("Owners and admins only.", { status: 403 });
  if (!hasFeature(workspace, "activityExport"))
    return new NextResponse(
      `Activity export comes with the ${PLANS[planFor("activityExport")].name} plan.`,
      { status: 402 },
    );
  const q = new URL(req.url).searchParams;
  const filters: AuditFilters = {
    actor: q.get("actor") || undefined,
    action: q.get("action") || undefined,
    targetType: q.get("target") || undefined,
    from: q.get("from") ? new Date(q.get("from")!) : undefined,
    to: q.get("to") ? new Date(`${q.get("to")}T23:59:59.999Z`) : undefined,
  };
  const cell = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "time",
    "actor_type",
    "actor",
    "action",
    "target_type",
    "target_id",
    "target",
    "changes",
    "request_id",
    "ip",
  ];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(header.join(",") + "\n"));
      let cursor = decodeCursor(q.get("before"));
      let total = 0;
      // Page through the keyset in chunks; the export costs the same however long the log is.
      for (let page = 0; page < 200; page++) {
        const { rows, next } = await listActivity(workspace.id, { cursor, limit: 200, filters });
        for (const e of rows) {
          controller.enqueue(
            encoder.encode(
              [
                e.createdAt,
                e.actorType,
                e.actorLabel,
                e.action,
                e.targetType,
                e.targetId,
                e.targetLabel,
                JSON.stringify(e.changes),
                e.requestId,
                e.ip,
              ]
                .map(cell)
                .join(",") + "\n",
            ),
          );
        }
        total += rows.length;
        if (!next) break;
        cursor = decodeCursor(next);
      }
      controller.close();
      await audit({
        action: "activity.exported",
        target: { type: "workspace", id: workspace.id, label: workspace.name },
        changes: { rows: { to: total } },
      });
    },
  });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${workspace.slug}-activity-${day}.csv"`,
      "cache-control": "no-store",
    },
  });
}
