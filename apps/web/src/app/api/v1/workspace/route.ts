import { apiContext, json, options } from "@/server/api";
import { baseUrl, listProfiles } from "@/server/scheduling";

export const OPTIONS = options;

/** GET /api/v1/workspace — name, timezone and public booking pages. */
export async function GET(req: Request) {
  const ctx = await apiContext(req);
  if (ctx instanceof Response) return ctx;
  const { workspace } = ctx;
  const profiles = await listProfiles(workspace.id);
  return json({
    name: workspace.name,
    description: workspace.description,
    timezone: workspace.timezone,
    url: baseUrl(),
    hosts: profiles.map((p) => ({
      username: p.username,
      name: p.displayName,
      bio: p.bio,
      avatarUrl: p.avatarUrl,
      timezone: p.timezone,
      url: `${baseUrl()}/${p.username}`,
    })),
  });
}
