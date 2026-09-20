import { bookingIcs } from "@/server/booking-flow";
import { getBookingByToken } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";

export async function GET(_req: Request, ctx: RouteContext<"/booking/[token]/ics">) {
  const { token } = await ctx.params;
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id) return new Response("Not found", { status: 404 });
  return new Response(await bookingIcs(b, ws), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${b.id.slice(0, 8)}.ics"`,
    },
  });
}
