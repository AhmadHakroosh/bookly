import { NextResponse } from "next/server";
import { invalidateBusy, verifyNotification } from "@/server/integrations";

/** Google Calendar → Bookly: a watched calendar changed; drop the cached busy time. */
export async function POST(req: Request) {
  const state = req.headers.get("x-goog-resource-state");
  if (state === "sync") return new NextResponse(null, { status: 200 });
  const i = await verifyNotification(req.headers.get("x-goog-channel-token"));
  if (!i) return NextResponse.json({ error: "Unknown channel" }, { status: 404 });
  invalidateBusy(i.userId);
  return new NextResponse(null, { status: 200 });
}
