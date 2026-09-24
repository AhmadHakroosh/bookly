import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { apiContext, apiError, json, options, serializeBooking } from "@/server/api";
import { publicBaseUrl } from "@/server/urls";

export const OPTIONS = options;

/** GET /api/v1/bookings/{id} (scope bookings:read) */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/bookings/[id]">) {
  const api = await apiContext(req, "bookings:read");
  if (api instanceof Response) return api;
  const { id } = await ctx.params;
  const b = await db().query.bookings.findFirst({
    where: and(eq(schema.bookings.id, id), eq(schema.bookings.workspaceId, api.workspace.id)),
  });
  if (!b) return apiError("Booking not found", 404, "not_found");
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({
        where: eq(schema.eventTypes.id, b.eventTypeId),
        columns: { id: true, slug: true, title: true },
      })
    : null;
  return json(serializeBooking(b, await publicBaseUrl(api.workspace), { eventType: et ?? null }));
}
