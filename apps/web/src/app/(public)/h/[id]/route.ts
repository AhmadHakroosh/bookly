import { NextResponse } from "next/server";
import { hostBookingUrl } from "@/server/short-links";

/**
 * GET /h/<booking id>: the booking in its workspace's admin (the admin asks the host to sign
 * in if they are not). `/h/admin` opens the admin without a booking.
 */
export async function GET(_req: Request, ctx: RouteContext<"/h/[id]">) {
  const { id } = await ctx.params;
  const url = await hostBookingUrl(id);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url, 302);
}
