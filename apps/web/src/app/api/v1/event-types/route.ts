import { apiContext, apiError, json, options, serializeEventType } from "@/server/api";
import { getProfileByUsername, listAllEventTypes, listProfiles } from "@/server/scheduling";

export const OPTIONS = options;

/** GET /api/v1/event-types?username=<host> — bookable event types (hidden ones only with a key). */
export async function GET(req: Request) {
  const ctx = await apiContext(req);
  if (ctx instanceof Response) return ctx;
  const { workspace, key } = ctx;
  const username = new URL(req.url).searchParams.get("username");
  const profiles = username
    ? [await getProfileByUsername(workspace.id, username)].filter((p) => p !== null)
    : await listProfiles(workspace.id);
  if (username && profiles.length === 0) return apiError("Host not found", 404, "not_found");
  const byUser = new Map(profiles.map((p) => [p.userId, p]));
  const all = await listAllEventTypes(workspace.id);
  const visible = all.filter((e) => e.active && byUser.has(e.userId) && (key || !e.hidden));
  return json(
    visible.map((e) => serializeEventType(e, byUser.get(e.userId)!)),
    { meta: { total: visible.length, authenticated: !!key } },
  );
}
