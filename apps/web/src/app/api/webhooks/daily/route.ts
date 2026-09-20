import { NextResponse } from "next/server";
import { and, eq, schema, sql } from "@bookly/db";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { verifyDailySignature } from "@/server/integrations";
import { notifyHost } from "@/server/notify";
import { getProfileByUser } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";

type DailyEvent = {
  type: string;
  payload?: { room?: string; user_name?: string | null; user_id?: string | null };
};

/** Daily.co → Bookly: tells the host when the first participant enters a booking's room. */
export async function POST(req: Request) {
  const ws = await getCurrentWorkspace();
  const hmac = ws?.settings.daily?.hmac;
  if (!ws || !hmac) return NextResponse.json({ error: "Webhook not registered" }, { status: 404 });
  const body = await req.text();
  const ts = req.headers.get("x-webhook-timestamp") ?? "";
  const sig = req.headers.get("x-webhook-signature") ?? "";
  if (!ts || !sig || !verifyDailySignature(hmac, ts, sig, body))
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  const ev = JSON.parse(body) as DailyEvent;
  if (ev.type !== "participant.joined" || !ev.payload?.room)
    return NextResponse.json({ ok: true, ignored: ev.type });

  const room = ev.payload.room;
  const b = await db().query.bookings.findFirst({
    where: and(
      eq(schema.bookings.workspaceId, ws.id),
      eq(schema.bookings.meetingProvider, "daily"),
      sql`${schema.bookings.meetingRef}->>'room' = ${room}`,
    ),
  });
  if (!b) return NextResponse.json({ ok: true, ignored: "unknown room" });
  const host = await getProfileByUser(ws.id, b.hostUserId);
  const who = ev.payload.user_name?.trim() || "Someone";
  // The host joining their own room is not news.
  if (host && who.toLowerCase() === host.displayName.toLowerCase())
    return NextResponse.json({ ok: true, ignored: "host" });
  const key = "joined";
  if (b.remindersSent.includes(key))
    return NextResponse.json({ ok: true, ignored: "already notified" });
  await db()
    .update(schema.bookings)
    .set({ remindersSent: [...b.remindersSent, key] })
    .where(eq(schema.bookings.id, b.id));
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({
        where: eq(schema.eventTypes.id, b.eventTypeId),
        columns: { title: true },
      })
    : null;
  const text = `${who} just joined your ${et?.title ?? "meeting"} (${fmtDateTime(b.startAt, host?.timezone ?? ws.timezone)}). Join: ${b.meetingUrl}`;
  await notifyHost(b.hostUserId, "onJoin", {
    subject: `${who} joined your call`,
    text,
    email: { subject: `${who} joined your call`, text },
  });
  return NextResponse.json({ ok: true });
}
