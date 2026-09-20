import { apiContext, apiError, json, options, readJson, serializeBooking } from "@/server/api";
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
  const b = await cancelBooking(api.workspace, id, by, reason);
  if (!b) return apiError("Booking not found", 404, "not_found");
  return json(serializeBooking(b));
}
