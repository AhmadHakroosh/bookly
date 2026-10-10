import { apiContext, apiError, json, options, readJson, serializeBooking } from "@/server/api";
import { publicBaseUrl } from "@/server/urls";
import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { API_KEY_ACTOR, SYSTEM_ACTOR, audit } from "@/server/audit";
import { cancelBooking } from "@/server/booking-flow";

export const OPTIONS = options;

/** POST /api/v1/bookings/{id}/cancel { reason?, by? } (scope bookings:write) */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/bookings/[id]/cancel">) {
  const api = await apiContext(req, "bookings:write");
  if (api instanceof Response) return api;
  const { id } = await ctx.params;
  const body = req.headers.get("content-length") === "0" ? {} : await readJson(req);
  if (body instanceof Response) return body;
  const by = body.by === "attendee" ? "attendee" : "host";
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;
  const before = await db().query.bookings.findFirst({
    where: and(eq(schema.bookings.id, id), eq(schema.bookings.workspaceId, api.workspace.id)),
    columns: { status: true },
  });
  const b = await cancelBooking(api.workspace, id, by, reason);
  if (!b) return apiError("Booking not found", 404, "not_found");
  if (before && before.status !== "cancelled")
    await audit({
      action: "booking.cancelled",
      target: { type: "booking", id: b.id, label: b.attendeeName },
      actor: api.key ? API_KEY_ACTOR(api.key) : SYSTEM_ACTOR("api"),
      workspace: api.workspace.id,
      changes: { status: { from: before.status, to: b.status }, cancelledBy: { to: by } },
    });
  return json(serializeBooking(b, await publicBaseUrl(api.workspace)));
}
