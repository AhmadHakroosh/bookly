import { z } from "zod";
import { apiContext, apiError, json, options, readJson, serializeBooking } from "@/server/api";
import { isValidTimezone } from "@/lib/time";
import { BookingError, createBooking } from "@/server/booking-flow";
import { getEventType, getProfileByUsername, listBookings } from "@/server/scheduling";

export const OPTIONS = options;

/** GET /api/v1/bookings?status=&upcoming=1&username=&limit= (scope bookings:read) */
export async function GET(req: Request) {
  const ctx = await apiContext(req, "bookings:read");
  if (ctx instanceof Response) return ctx;
  const q = new URL(req.url).searchParams;
  const username = q.get("username");
  const profile = username ? await getProfileByUsername(ctx.workspace.id, username) : null;
  if (username && !profile) return apiError("Host not found", 404, "not_found");
  const upcoming = q.get("upcoming") === "1" ? true : q.get("upcoming") === "0" ? false : undefined;
  const status = q.get("status");
  const limit = Math.min(500, Math.max(1, Number(q.get("limit")) || 100));
  const rows = await listBookings(ctx.workspace.id, {
    userId: profile?.userId,
    upcoming,
    limit,
  });
  const filtered = status ? rows.filter((b) => b.status === status) : rows;
  return json(
    filtered.map((b) =>
      serializeBooking(b, {
        eventType: b.eventTypeId
          ? { id: b.eventTypeId, slug: "", title: b.eventTitle ?? "" }
          : null,
      }),
    ),
    { meta: { total: filtered.length } },
  );
}

const createSchema = z.object({
  username: z.string().min(1),
  event: z.string().min(1),
  start: z.string().min(1),
  timezone: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  answers: z.record(z.string(), z.string().max(2000)).optional(),
});

/** POST /api/v1/bookings (scope bookings:write) — books a slot exactly like the public page. */
export async function POST(req: Request) {
  const ctx = await apiContext(req, "bookings:write");
  if (ctx instanceof Response) return ctx;
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return apiError(parsed.error.issues[0]?.message ?? "Invalid body", 400, "bad_request");
  const d = parsed.data;
  if (!isValidTimezone(d.timezone)) return apiError("Unknown timezone", 400, "bad_request");
  const start = new Date(d.start);
  if (Number.isNaN(start.getTime())) return apiError("start must be ISO 8601", 400, "bad_request");
  const profile = await getProfileByUsername(ctx.workspace.id, d.username);
  const et = profile ? await getEventType(ctx.workspace.id, profile.userId, d.event) : null;
  if (!profile || !et || !et.active) return apiError("Event type not found", 404, "not_found");
  const answers: Record<string, string> = {};
  for (const q of et.questions) answers[q.id] = d.answers?.[q.id] ?? d.answers?.[q.label] ?? "";
  try {
    const b = await createBooking(ctx.workspace, et, {
      start,
      timezone: d.timezone,
      name: d.name,
      email: d.email,
      phone: d.phone,
      notes: d.notes,
      answers,
    });
    return json(serializeBooking(b, { eventType: et }), {
      status: 201,
      meta: b.skipped?.length ? { skipped: b.skipped.map((d) => d.toISOString()) } : undefined,
    });
  } catch (e) {
    if (e instanceof BookingError) return apiError(e.message, 409, "unavailable");
    console.error("[api] create booking failed", e);
    return apiError("Booking failed", 500, "internal");
  }
}
