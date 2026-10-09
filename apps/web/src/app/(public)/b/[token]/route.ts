import { NextResponse } from "next/server";
import { guestBookingUrl } from "@/server/short-links";

/**
 * GET /b/<manage token>: the guest's booking page on its workspace host. Used where a link has
 * to share one prefix for every workspace, such as a WhatsApp template button.
 */
export async function GET(_req: Request, ctx: RouteContext<"/b/[token]">) {
  const { token } = await ctx.params;
  const url = await guestBookingUrl(token);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url, 302);
}
