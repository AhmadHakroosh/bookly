import { NextResponse } from "next/server";
import { loadEnv } from "@bookly/config";
import { receiveReply, verifySvix, type ReceivedWebhook } from "@/server/inbound";

/**
 * Resend's webhook (Svix-signed). `email.received` puts a guest's reply on the contact's
 * timeline; every other event type is acknowledged and ignored. Anything we skip on purpose
 * answers 200 so Resend does not retry it; a failure to fetch the message answers 500 so it does.
 */
export async function POST(req: Request) {
  const secret = loadEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 404 });
  const body = await req.text();
  const ok = verifySvix(
    body,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    secret,
  );
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let event: { type?: string; data?: ReceivedWebhook };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (event.type !== "email.received" || !event.data?.email_id)
    return NextResponse.json({ received: true, ignored: event.type ?? "unknown" });
  try {
    return NextResponse.json({ received: true, ...(await receiveReply(event.data)) });
  } catch (e) {
    console.error("[inbound] reply failed", e);
    return NextResponse.json({ error: "Try again" }, { status: 500 });
  }
}
