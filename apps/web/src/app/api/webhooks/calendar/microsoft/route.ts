import { NextResponse } from "next/server";
import { invalidateBusy, verifyNotification } from "@/server/integrations";

type Notification = { value?: { clientState?: string; subscriptionId?: string }[] };

/** Microsoft Graph → Bookly: subscription validation handshake and change notifications. */
export async function POST(req: Request) {
  const validation = new URL(req.url).searchParams.get("validationToken");
  if (validation)
    return new NextResponse(validation, { status: 200, headers: { "content-type": "text/plain" } });
  let body: Notification;
  try {
    body = (await req.json()) as Notification;
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  const seen = new Set<string>();
  for (const n of body.value ?? []) {
    const i = await verifyNotification(n.clientState);
    if (i && !seen.has(i.userId)) {
      seen.add(i.userId);
      invalidateBusy(i.userId);
    }
  }
  return new NextResponse(null, { status: 202 });
}
