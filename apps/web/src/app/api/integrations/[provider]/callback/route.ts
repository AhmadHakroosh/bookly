import { NextResponse } from "next/server";
import { and, eq, schema } from "@bookly/db";
import { verifyState } from "@/lib/crypto";
import { db } from "@/lib/db";
import { connectIntegration, isProvider } from "@/server/integrations";
import { isCloud, tenantUrl } from "@/server/platform";
import { getSession } from "@/server/session";
import { getWorkspaceById } from "@/server/workspace";

/**
 * OAuth redirect target. Verifies the signed state, exchanges the code, stores the connection.
 * The redirect URI registered with each provider is on APP_URL, which in cloud mode is the
 * platform host, so the workspace comes from the signed state (not from the request host) and
 * the user is sent back to the workspace's own subdomain. The session cookie spans subdomains.
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/integrations/[provider]/callback">,
) {
  const { provider } = await ctx.params;
  if (!isProvider(provider))
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const url = new URL(req.url);
  const state = verifyState(url.searchParams.get("state") ?? "");
  const back = state?.back?.startsWith("/") ? state.back : "/admin/calendars";
  const ws = state?.w ? await getWorkspaceById(state.w) : null;
  // Where the host came from: their workspace's host in cloud mode, this host otherwise.
  const home = (path: string) =>
    ws && isCloud() ? tenantUrl(ws.slug, path) : new URL(path, req.url).toString();
  const fail = (code: string) => NextResponse.redirect(home(`${back}?error=${code}`));
  if (!state || !ws) return fail("state");
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);
  const code = url.searchParams.get("code");
  if (!code) return fail("code");
  const session = await getSession();
  if (!session || session.user.id !== state.u) return fail("mismatch");
  const member = await db().query.members.findFirst({
    where: and(
      eq(schema.members.organizationId, ws.organizationId),
      eq(schema.members.userId, session.user.id),
    ),
    columns: { role: true },
  });
  if (!member) return fail("mismatch");
  try {
    await connectIntegration(ws.id, session.user.id, provider, code);
  } catch (e) {
    console.error("[integrations] connect failed", e);
    return fail("exchange");
  }
  return NextResponse.redirect(home(`${back}?connected=${provider}`));
}
