import { apiContext, json, options } from "@/server/api";
import { listProfiles } from "@/server/scheduling";
import { publicBaseUrl } from "@/server/urls";

export const OPTIONS = options;

/** GET /api/v1/workspace — name, timezone and public booking pages. */
export async function GET(req: Request) {
  const ctx = await apiContext(req);
  if (ctx instanceof Response) return ctx;
  const { workspace } = ctx;
  const profiles = await listProfiles(workspace.id);
  const base = await publicBaseUrl(workspace);
  return json({
    name: workspace.name,
    description: workspace.description,
    timezone: workspace.timezone,
    url: base,
    hosts: profiles.map((p) => ({
      username: p.username,
      name: p.displayName,
      bio: p.bio,
      avatarUrl: p.avatarUrl,
      timezone: p.timezone,
      url: `${base}/${p.username}`,
    })),
  });
}
