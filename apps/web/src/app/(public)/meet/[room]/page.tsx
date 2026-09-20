import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { dailyConfigured, dailyRoomUrl } from "@/server/integrations";
import { getProfileByUser } from "@/server/scheduling";

export const metadata: Metadata = { title: "Meeting", robots: { index: false, follow: false } };

/** Built-in video: wraps Daily Prebuilt for the room created for a booking. */
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
    },
  });
  const b = rows.find((r) => (r.meetingRef as { room?: string } | null)?.room === room);
  if (!b || b.status === "cancelled") notFound();
  const host = await getProfileByUser(b.workspaceId, b.hostUserId);
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({
        where: eq(schema.eventTypes.id, b.eventTypeId),
        columns: { title: true },
      })
    : null;
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="font-medium">
          {et?.title ?? "Meeting"} with {host?.displayName ?? "your host"}
        </span>
        <span className="text-white/60">{fmtDateTime(b.startAt, b.timezone)}</span>
      </header>
      <iframe
        title="Video call"
        src={dailyRoomUrl(room)}
        allow="camera; microphone; display-capture; autoplay; clipboard-write; picture-in-picture; fullscreen"
        className="w-full flex-1 border-0"
      />
    </div>
  );
}

export default function MeetPageBoundary(props: PageProps<"/meet/[room]">) {
  return (
    <Suspense fallback={null}>
      <MeetPage {...props} />
    </Suspense>
  );
}
