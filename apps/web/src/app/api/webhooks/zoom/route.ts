import { NextResponse } from "next/server";
import { and, eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";
import { verifyZoomSignature, zoomChallenge } from "@/server/integrations/zoom";

type ZoomEvent = {
  event?: string;
  payload?: {
    plainToken?: string;
    user_id?: string;
    account_id?: string;
    client_id?: string;
    deauthorization_time?: string;
  };
};

/**
 * Zoom → Bookly. Two events: the URL validation Zoom sends when the endpoint is saved, and
 * `app_deauthorized` when a user removes Bookly from their Zoom account, which drops their
 * connection, tokens included, at once (Zoom allows ten days). Everything else is acknowledged
 * and ignored.
 */
export async function POST(req: Request) {
  const secret = loadEnv().ZOOM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "ZOOM_WEBHOOK_SECRET not set" }, { status: 500 });
  const body = await req.text();
  const ok = verifyZoomSignature(
    secret,
    {
      timestamp: req.headers.get("x-zm-request-timestamp"),
      signature: req.headers.get("x-zm-signature"),
    },
    body,
  );
  if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  let ev: ZoomEvent;
  try {
    ev = JSON.parse(body) as ZoomEvent;
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  if (ev.event === "endpoint.url_validation" && ev.payload?.plainToken)
    return NextResponse.json(zoomChallenge(secret, ev.payload.plainToken));
  if (ev.event === "app_deauthorized" && ev.payload?.user_id) {
    const p = ev.payload;
    // The Zoom user id is what a connection stored when it was made.
    const removed = await db()
      .delete(schema.integrations)
      .where(
        and(
          eq(schema.integrations.provider, "zoom"),
          eq(schema.integrations.externalAccountId, p.user_id!),
        ),
      )
      .returning({ id: schema.integrations.id });
    const oneLine = (v: unknown) => String(v ?? "?").replace(/[\r\n]+/g, " ");
    console.log(
      `[zoom] deauthorized user ${oneLine(p.user_id)} (account ${oneLine(p.account_id)}): ${removed.length} connection(s) removed`,
    );
    return NextResponse.json({ ok: true, removed: removed.length });
  }
  return NextResponse.json({ ok: true, ignored: ev.event ?? "unknown" });
}
