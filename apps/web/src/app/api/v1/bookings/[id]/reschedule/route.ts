import { apiContext, apiError, json, options, readJson, serializeBooking } from "@/server/api";
import { publicBaseUrl } from "@/server/urls";
import { isValidTimezone } from "@/lib/time";
import { BookingError, rescheduleBooking } from "@/server/booking-flow";

export const OPTIONS = options;

/** POST /api/v1/bookings/{id}/reschedule { start, timezone? } (scope bookings:write) */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/bookings/[id]/reschedule">) {
  const api = await apiContext(req, "bookings:write");
  if (api instanceof Response) return api;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const start = new Date(String(body.start ?? ""));
  if (Number.isNaN(start.getTime())) return apiError("start must be ISO 8601", 400, "bad_request");
  const tz = typeof body.timezone === "string" ? body.timezone : null;
  if (tz && !isValidTimezone(tz)) return apiError("Unknown timezone", 400, "bad_request");
  try {
    const b = await rescheduleBooking(api.workspace, id, start, tz);
    return json(serializeBooking(b, await publicBaseUrl(api.workspace)), { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) return apiError(e.message, 409, "unavailable");
    console.error("[api] reschedule failed", e);
    return apiError("Reschedule failed", 500, "internal");
  }
}
