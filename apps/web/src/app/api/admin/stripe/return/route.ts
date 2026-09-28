import { NextResponse } from "next/server";
import { connection } from "next/server";
import { refreshConnectStatus, syncConnectBranding } from "@/server/connect";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/**
 * Where Stripe sends the host back after Connect onboarding. Pulls the account's flags and
 * refreshes the workspace cache here, in a route handler, because a page render may not
 * revalidate; then lands on Settings, which reads the fresh state.
 */
export async function GET(request: Request) {
  await connection();
  const [session, role, ws] = await Promise.all([
    getSession(),
    getStaffRole(),
    getCurrentWorkspace(),
  ]);
  const settings = new URL("/admin/settings", request.url);
  if (!session || !ws || !role) return NextResponse.redirect(new URL("/login", request.url));
  if (ws.stripeAccountId) {
    await refreshConnectStatus(ws).catch(() => null);
    await syncConnectBranding(ws);
  }
  return NextResponse.redirect(settings);
}
