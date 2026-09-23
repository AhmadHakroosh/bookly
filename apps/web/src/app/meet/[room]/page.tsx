import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { dailyConfigured, dailyRoomUrl } from "@/server/integrations";
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
async function MeetPage({ params }: PageProps<"/meet/[room]">) {
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
