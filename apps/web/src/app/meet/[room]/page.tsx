import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { loadEnv } from "@bookly/config";
import { fmtDateTime } from "@/lib/time";
import { createMeetingToken, dailyConfigured, dailyRoomUrl } from "@/server/integrations";
import { getSession } from "@/server/session";
import { and, eq as eqq } from "@bookly/db";
import { notesOn } from "@/server/meeting-notes";
import { getProfileByUser } from "@/server/scheduling";
import { captureEnabled, encryptedLocation } from "@/server/transcripts";
import { Logo, LogoMark } from "@/components/brand/logo";
import { accentVars, workspaceBrand } from "@/server/brand";
import { Call } from "./call";

export const metadata: Metadata = { title: "Meeting", robots: { index: false, follow: false } };

/**
 * Bookly video: Bookly's own call UI (see call.tsx) on the Daily room created for a booking.
 * Lives outside the public shell (no workspace header or footer) and fills the viewport. Light,
 * like the rest of Bookly (mocks.png 04); the video tiles are dark because video is.
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
      location: true,
      captureConsent: true,
      attendeeName: true,
      manageToken: true,
    },
  });
  const b = rows.find((r) => (r.meetingRef as { room?: string } | null)?.room === room);
  if (!b || b.status === "cancelled") notFound();
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, b.workspaceId),
  });
  // Plans with their own branding (and every self-hosted install) put the workspace's logo,
  // name and accent on the call; everyone else sees Bookly's.
  const brand = workspaceBrand(ws ?? null);
  const style = {
    ...(accentVars(brand) ?? {}),
    ...(brand.ownAccent ? { "--brand": brand.ownAccent } : {}),
  } as React.CSSProperties;
  const host = await getProfileByUser(b.workspaceId, b.hostUserId);
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({
        where: eq(schema.eventTypes.id, b.eventTypeId),
        columns: { title: true, autoCapture: true },
      })
    : null;
  const capture = captureEnabled(b, et ?? null);
  const encrypted = encryptedLocation(b.location);
  // Who is opening the page: a signed-in member of the workspace joins as the room owner (so the
  // webhook sees `owner: true` and capture starts once an attendee is in); the attendee's link
  // carries their manage token, which pre-fills their name. Rooms are private, so anyone else
  // picks a name, knocks, and waits for the host to let them in.
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  // Sign-in lives on the app host: on a dedicated meeting host (MEET_URL) every path is a room.
  const signInUrl = `${loadEnv().APP_URL.replace(/\/$/, "")}/login?next=${encodeURIComponent(`/meet/${room}`)}`;
  let token: string | null = null;
  let initialName = "";
  // In-meeting notes: members only (they join as the room's owner), on a plan and flag with notes.
  let notes = false;
  // Where a member finds the recap once the call is over: the booking, on the app's own host.
  let recap: string | null = null;
  try {
    if (session) {
      const member = ws
        ? await db().query.members.findFirst({
            where: and(
              eqq(schema.members.organizationId, ws.organizationId),
              eqq(schema.members.userId, session.user.id),
            ),
            columns: { role: true },
          })
        : null;
      if (member) {
        const me =
          session.user.id === b.hostUserId
            ? host
            : await getProfileByUser(b.workspaceId, session.user.id);
        initialName = me?.displayName ?? session.user.name ?? "Host";
        token = await createMeetingToken(room, {
          userName: initialName,
          isOwner: true,
          expiresAt: new Date(b.endAt.getTime() + 2 * 3600_000),
        });
        notes = !!ws && (await notesOn(ws));
        recap = loadEnv().MEET_URL ? null : `/admin/bookings/${b.id}`;
      }
    } else if (typeof sp.t === "string" && sp.t === b.manageToken) {
      initialName = b.attendeeName;
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
    <div className="flex h-dvh flex-col bg-background text-foreground" style={style}>
      <Call
        url={dailyRoomUrl(room)}
        token={token}
        room={room}
        capture={capture}
        consent={capture && et?.autoCapture === "ask"}
        encrypted={encrypted}
        hostName={host?.displayName ?? ""}
        attendeeName={b.attendeeName}
        initialName={initialName}
        needsName={!token}
        notes={notes}
        recap={recap}
        when={fmtDateTime(b.startAt, b.timezone)}
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            {brand.own ? (
              <span className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
                {brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logoUrl} alt="" className="size-6 rounded-md object-contain" />
                ) : (
                  <LogoMark className="size-6" accent={brand.accent} />
                )}
                <span className="hidden sm:inline">{brand.name}</span>
              </span>
            ) : (
              <Logo size={22} className="shrink-0" />
            )}
            <span className="truncate font-medium">
              {et?.title ?? "Meeting"} with {host?.displayName ?? "your host"}
            </span>
          </span>
        }
        hint={
          !token && !session ? (
            <p className="bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground">
              Hosting this call?{" "}
              <a className="underline underline-offset-2" href={signInUrl}>
                Sign in
              </a>{" "}
              to open it as the host.
            </p>
          ) : null
        }
      />
    </div>
  );
}

export default function MeetPageBoundary(props: PageProps<"/meet/[room]">) {
  return (
    <Suspense fallback={<div className="h-dvh bg-background" aria-busy aria-label="Loading" />}>
      <MeetPage {...props} />
    </Suspense>
  );
}
