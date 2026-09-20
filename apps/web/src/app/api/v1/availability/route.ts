import { apiContext, apiError, json, options } from "@/server/api";
import { addDays, isValidTimezone, todayIn } from "@/lib/time";
import { availableSlots, getEventType, getProfileByUsername } from "@/server/scheduling";

export const OPTIONS = options;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;

/**
 * GET /api/v1/availability?username=&event=&from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=
 * Free start times for an event type, grouped by day in the given timezone.
 */
export async function GET(req: Request) {
  const ctx = await apiContext(req);
  if (ctx instanceof Response) return ctx;
  const q = new URL(req.url).searchParams;
  const username = q.get("username") ?? "";
  const event = q.get("event") ?? "";
  const tz = q.get("timezone") ?? "UTC";
  if (!username || !event) return apiError("username and event are required", 400, "bad_request");
  if (!isValidTimezone(tz)) return apiError("Unknown timezone", 400, "bad_request");
  const profile = await getProfileByUsername(ctx.workspace.id, username);
  const et = profile ? await getEventType(ctx.workspace.id, profile.userId, event) : null;
  if (!profile || !et || !et.active) return apiError("Event type not found", 404, "not_found");
  const from = q.get("from") ?? todayIn(tz);
  const to = q.get("to") ?? addDays(from, 13);
  if (!DAY.test(from) || !DAY.test(to) || to < from)
    return apiError("from/to must be YYYY-MM-DD with to >= from", 400, "bad_request");
  if (addDays(from, MAX_RANGE_DAYS) < to)
    return apiError(`Range must be at most ${MAX_RANGE_DAYS} days`, 400, "bad_request");
  const slots = await availableSlots(et, tz, from, to);
  return json(slots, {
    meta: { username, event, timezone: tz, from, to, durationMin: et.durationMin },
  });
}
