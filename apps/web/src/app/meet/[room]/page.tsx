import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { createMeetingToken, dailyConfigured, dailyRoomUrl } from "@/server/integrations";
import { getSession } from "@/server/session";
import { and, eq as eqq } from "@bookly/db";
import { getProfileByUser } from "@/server/scheduling";
import { captureEnabled } from "@/server/transcripts";
import { Call } from "./call";

export const metadata: Metadata = { title: "Meeting", robots: { index: false, follow: false } };

/**
 * Bookly video: wraps Daily Prebuilt for the room created for a booking. Lives outside the
 * public shell (no workspace header or footer) and fills the viewport: the frame's height is a
 * percentage, which only resolves against a definite height, hence `h-dvh` rather than a
 * minimum.
 */
async function MeetPage({ params, searchParams }: PageProps<"/meet/[room]">) {
  const { room } = await params;
  if (!dailyConfigured() || !/^b-[a-z0-9]+$/.test(room)) notFound();
  // Look up by room name stored in meetingRef.
  const rows = await db().query.bookings.findMany({
    where: eq(schema.bookings.meetingProvider, "daily"),
    columns: {
      id: true,
      workspaceId: true,
      hostUserId: true,
      startAt: true,
      endAt: true,
      status: true,
      meetingRef: true,
      eventTypeId: true,
      timezone: true,
      meetingProvider: true,
      captureConsent: true,
      attendeeName: true,
      manageToken: true,
    },
  });
  const b = rows.find((r) => (r.meetingRef as { room?: string } | null)?.room === room);
  if (!b || b.status === "cancelled") notFound();
  const host = await getProfileByUser(b.workspaceId, b.hostUserId);
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({
        where: eq(schema.eventTypes.id, b.eventTypeId),
        columns: { title: true, autoCapture: true },
      })
    : null;
  const capture = captureEnabled(b, et ?? null);
  // Who is opening the page: a signed-in member of the workspace joins as the room owner (so the
  // webhook sees `owner: true` and capture starts once an attendee is in); the attendee's link
  // carries their manage token, which pre-fills their name. Anyone else picks a name on join.
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  let token: string | null = null;
  try {
    if (session) {
      const member = await db().query.members.findFirst({
        where: and(
          eqq(
            schema.members.organizationId,
            (await db().query.workspaces.findFirst({
              where: eq(schema.workspaces.id, b.workspaceId),
              columns: { organizationId: true },
            }))!.organizationId,
          ),
          eqq(schema.members.userId, session.user.id),
        ),
        columns: { role: true },
      });
      if (member) {
        const me =
          session.user.id === b.hostUserId
            ? host
            : await getProfileByUser(b.workspaceId, session.user.id);
        token = await createMeetingToken(room, {
          userName: me?.displayName ?? session.user.name ?? "Host",
          isOwner: true,
          expiresAt: new Date(b.endAt.getTime() + 2 * 3600_000),
        });
      }
    } else if (typeof sp.t === "string" && sp.t === b.manageToken) {
      token = await createMeetingToken(room, {
        userName: b.attendeeName,
        isOwner: false,
        expiresAt: new Date(b.endAt.getTime() + 2 * 3600_000),
      });
    }
  } catch (e) {
    console.error("[meet] token", e);
  }
  return (
    <div className="flex h-dvh flex-col bg-black text-white">
      <header className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="font-medium">
          {et?.title ?? "Meeting"} with {host?.displayName ?? "your host"}
        </span>
        <span className="text-white/60">{fmtDateTime(b.startAt, b.timezone)}</span>
      </header>
      {capture && (
        <p className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-200">
          This call is transcribed so both sides get notes and action items afterwards.
        </p>
      )}
      <Call
        url={dailyRoomUrl(room)}
        token={token}
        room={room}
        capture={capture}
        hostName={host?.displayName ?? ""}
        attendeeName={b.attendeeName}
      />
    </div>
  );
}

export default function MeetPageBoundary(props: PageProps<"/meet/[room]">) {
  return (
    <Suspense fallback={<div className="h-dvh bg-black" aria-busy aria-label="Loading" />}>
      <MeetPage {...props} />
    </Suspense>
  );
}
