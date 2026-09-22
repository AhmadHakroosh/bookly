import { NextResponse } from "next/server";
import { connection } from "next/server";
import { brandForPreview } from "@/emails/brand";
import {
  attendeeConfirmation,
  cancellationMail,
  followUpMail,
  reminderMail,
  type BookingMailCtx,
} from "@/emails/booking";
import { db } from "@/lib/db";
import { getProfileByUser } from "@/server/scheduling";
import { baseUrl } from "@/server/scheduling";
import { renderOutreach, templatesFor } from "@/server/outreach";
import { fillTemplate } from "@/server/outreach-text";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** Renders one guest email with sample data and the workspace's current wording and brand. */
export async function GET(req: Request) {
  await connection();
  const { session } = await requireStaff();
  const ws = await getCurrentWorkspace();
  if (!ws) return NextResponse.json({ error: "No workspace" }, { status: 404 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "confirmation";
  if (kind === "proposal" || kind === "paymentRequest") {
    const host = await getProfileByUser(ws.id, session.user.id);
    const t = fillTemplate(templatesFor(ws)[kind], {
      name: "Sam",
      company: "Acme Ltd",
      host: host?.displayName ?? session.user.name,
      amount: kind === "paymentRequest" ? "$1,200.00" : "",
      payLink: kind === "paymentRequest" ? "https://checkout.stripe.com/…" : "",
    });
    const mail = await renderOutreach(
      ws,
      host?.displayName ?? session.user.name,
      t.subject,
      t.body,
      kind === "paymentRequest" ? "https://checkout.stripe.com/" : undefined,
      await brandForPreview(ws),
    );
    return new NextResponse(mail.html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const [host, et] = await Promise.all([
    getProfileByUser(ws.id, session.user.id),
    db().query.eventTypes.findFirst({ where: (t, { eq }) => eq(t.workspaceId, ws.id) }),
  ]);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2);
  start.setUTCHours(10, 0, 0, 0);
  const ctx: BookingMailCtx = {
    booking: {
      id: "preview",
      attendeeName: "Sam Lee",
      attendeeEmail: "sam@example.com",
      manageToken: "preview",
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      timezone: host?.timezone ?? ws.timezone,
      status: "confirmed",
      location: { type: "daily" },
      meetingUrl: `${baseUrl()}/meet/b-preview`,
      answers: {},
      notes: null,
      cancelledBy: "attendee",
      cancelReason: null,
    } as never,
    eventType: (et ?? { title: "Intro call", autoCapture: "off", followUp: {} }) as never,
    host: (host ?? {
      displayName: session.user.name,
      timezone: ws.timezone,
      username: "you",
    }) as never,
    workspaceName: ws.name,
    baseUrl: baseUrl(),
    brand: await brandForPreview(ws),
    templates: ws.settings.templates,
  };
  const mail =
    kind === "reminder"
      ? await reminderMail(ctx, false, 1)
      : kind === "cancellation"
        ? await cancellationMail(ctx, false)
        : kind === "followUp"
          ? await followUpMail(ctx)
          : await attendeeConfirmation(ctx);
  return new NextResponse(mail.html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
