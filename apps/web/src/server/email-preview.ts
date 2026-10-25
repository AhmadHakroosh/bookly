import "server-only";
import type { Workspace } from "@bookly/db/schema";
import { brandForPreview } from "@/emails/brand";
import {
  attendeeConfirmation,
  cancellationMail,
  followUpMail,
  reminderMail,
  type BookingMailCtx,
} from "@/emails/booking";
import { db } from "@/lib/db";
import { renderOutreach, templatesFor } from "./outreach";
import { fillTemplate } from "./outreach-text";
import { baseUrl, getProfileByUser } from "./scheduling";
import { adminBaseUrl, publicBaseUrl } from "./urls";

/**
 * One guest email as HTML, with sample data and the workspace's current wording and brand: the
 * Emails tab opens it, the Branding tab shows the confirmation beside the form.
 */
export async function previewMail(
  ws: Workspace,
  user: { id: string; name: string },
  kind: string,
): Promise<string> {
  if (kind === "proposal" || kind === "paymentRequest" || kind === "checkIn") {
    const host = await getProfileByUser(ws.id, user.id);
    const t = fillTemplate(templatesFor(ws)[kind], {
      name: "Sam",
      company: "Acme Ltd",
      host: host?.displayName ?? user.name,
      amount: kind === "paymentRequest" ? "$1,200.00" : "",
      payLink: kind === "paymentRequest" ? "https://checkout.stripe.com/…" : "",
      bookingUrl: `${await publicBaseUrl(ws)}/you`,
    });
    const mail = await renderOutreach(
      ws,
      { id: "preview" },
      host?.displayName ?? user.name,
      t.subject,
      t.body,
      kind === "paymentRequest" ? "https://checkout.stripe.com/" : undefined,
      await brandForPreview(ws),
    );
    return mail.html;
  }
  const [host, et] = await Promise.all([
    getProfileByUser(ws.id, user.id),
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
      guests: [],
      notes: null,
      cancelledBy: "attendee",
      cancelReason: null,
    } as never,
    eventType: (et ?? { title: "Intro call", autoCapture: "off", followUp: {} }) as never,
    host: (host ?? {
      displayName: user.name,
      timezone: ws.timezone,
      username: "you",
    }) as never,
    workspaceName: ws.name,
    baseUrl: await publicBaseUrl(ws),
    adminUrl: adminBaseUrl(ws),
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
  return mail.html;
}
