import { apiContext, apiError, json, options, serializeEventType } from "@/server/api";
import { getEventType, getProfileByUsername } from "@/server/scheduling";

export const OPTIONS = options;

/** GET /api/v1/event-types/{username}/{slug} */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/v1/event-types/[username]/[slug]">,
) {
  const api = await apiContext(req);
  if (api instanceof Response) return api;
  const { username, slug } = await ctx.params;
  const profile = await getProfileByUsername(api.workspace.id, username);
  const et = profile ? await getEventType(api.workspace.id, profile.userId, slug) : null;
  if (!profile || !et || !et.active) return apiError("Event type not found", 404, "not_found");
  return json(serializeEventType(et, profile));
}
