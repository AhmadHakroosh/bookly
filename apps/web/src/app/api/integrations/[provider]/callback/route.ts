import { NextResponse } from "next/server";
import { verifyState } from "@/lib/crypto";
import { connectIntegration, isProvider } from "@/server/integrations";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** OAuth redirect target. Verifies the signed state, exchanges the code, stores the connection. */
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
  const fail = (code: string) => NextResponse.redirect(new URL(`${back}?error=${code}`, req.url));
  if (!state) return fail("state");
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);
  const code = url.searchParams.get("code");
  if (!code) return fail("code");
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || ws.id !== state.w || session.user.id !== state.u) return fail("mismatch");
  try {
    await connectIntegration(ws.id, session.user.id, provider, code);
  } catch (e) {
    console.error("[integrations] connect failed", e);
    return fail("exchange");
  }
  return NextResponse.redirect(new URL(`${back}?connected=${provider}`, req.url));
}
