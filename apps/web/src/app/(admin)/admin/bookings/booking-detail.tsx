/*
 * One booking in full, as the meeting detail of `ui mocks.png` 02 draws it: the person, the
 * event type and status, Join meeting and More actions, when, where (with the link to copy) and
 * who; then Briefing · Notes · Recap (the briefing and their answers; the in-call notes, action
 * items and capture; the recap, the attendee's recap and the transcript). Rendered by the
 * booking page and by the bookings side pane, so both always show the same.
 */
import Link from "next/link";
import { BackLink } from "@/components/links";
import { notFound } from "next/navigation";
import { and, eq, schema } from "@bookly/db";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/copy-button";
import { PaneHeader } from "@/components/ui/pane-header";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import { AiLabel } from "@/components/ai-label";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { fmtDateTime, fmtTime, formatInTz } from "@/lib/time";
import { TaskList } from "@/components/task-list";
import { assistantConfigured, briefForBooking } from "@/server/brief";
import { renderTranscript } from "@/server/transcript-text";
import { listOpenTasks } from "@/server/capture";
import { contactTimeline } from "@/server/contacts";
import { CaptureForm } from "./[id]/capture-form";
import { AttendeeRecap } from "./[id]/attendee-recap";
import { BookingNotes } from "./[id]/booking-notes";
import { RecapPanel } from "./[id]/recap-panel";
import { TranscriptPanel } from "./[id]/transcript-panel";
import { notesOn } from "@/server/meeting-notes";
import { getRecap, recapOf } from "@/server/recaps";
import { getTranscript } from "@/server/transcripts";
import { getProfileByUser, locationLabel } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { bookingsVisibleTo } from "@/server/access/hiring";
import { getCurrentWorkspace } from "@/server/workspace";
import { responseFiles } from "@/server/forms";
import { fileUrl } from "@/lib/files";
import { hostCancel, hostConfirm, hostMark, regenerateBrief } from "../scheduling-actions";
import { BookingRowMenu } from "./booking-row-menu";
import { sessionSummary } from "@/server/sessions";
import { CalendarIcon, CheckIcon, ClockIcon, UsersIcon, VideoIcon } from "lucide-react";

/** A booking's status as a chip: waiting on someone is a warning, ended badly is destructive. */
const STATUS_TONE: Record<string, StatusTone> = {
  awaiting_payment: "warning",
  pending: "warning",
  confirmed: "success",
  cancelled: "destructive",
  rescheduled: "info",
  completed: "neutral",
  no_show: "destructive",
};

export async function BookingDetail({ id, inPane = false }: { id: string; inPane?: boolean }) {
  const [{ session: signedIn }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  const viewer = signedIn.user.id;
  if (!ws) return null;
  // An interview opens only for people who may see its application (ADR 0005).
  // A plain select: the predicate names the table, which relational queries alias.
  const [b] = await db()
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.id, id),
        eq(schema.bookings.workspaceId, ws.id),
        bookingsVisibleTo(viewer),
      ),
    )
    .limit(1);
  if (!b) notFound();
  const hostProfile = await getProfileByUser(ws.id, b.hostUserId);
  const tz = hostProfile?.timezone ?? ws.timezone;
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
  const [brief, tasks, timeline, transcript, recapRow, sentFiles] = await Promise.all([
    briefForBooking(ws, b, et ?? null),
    listOpenTasks(ws.id, { bookingId: b.id }),
    b.contactId ? contactTimeline(b.contactId, 50, viewer) : Promise.resolve([]),
    b.transcriptStatus ? getTranscript(b.id) : Promise.resolve(null),
    getRecap(b.id),
    responseFiles(ws.id, b.id),
  ]);
  const lastCapture = timeline.find((e) => e.type === "capture" && e.bookingId === b.id);
  const recapDraft = recapOf(recapRow)?.followUp ?? null;
  const draft =
    recapDraft ??
    (
      lastCapture?.data as
        { capture?: { followUp?: { subject: string; body: string } | null } } | undefined
    )?.capture?.followUp ??
    null;
  const contact = b.contactId
    ? await db().query.contacts.findFirst({
        where: eq(schema.contacts.id, b.contactId),
        columns: { stage: true },
      })
    : null;
  const past = b.endAt <= new Date() || b.status === "completed" || b.status === "no_show";
  // In-meeting notes (Bookly video): the member's own, still editable after the call.
  const room = (b.meetingRef as { room?: string } | null)?.room;
  const notesHere =
    b.meetingProvider === "daily" && !!room && b.startAt <= new Date() && (await notesOn(ws));
  const session = await sessionSummary(b, et ?? null);
  const status = (
    <StatusChip tone={STATUS_TONE[b.status]} dot className="capitalize">
      {b.status.replace("_", " ")}
    </StatusChip>
  );
  const live = b.status === "confirmed" || b.status === "pending";
  const where = locationLabel(b.location);
  const recap = recapRow ? recapOf(recapRow) : null;
  const tab = past ? (recap ? "recap" : "notes") : "briefing";
  const minutes = Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000);
  const day = formatInTz(b.startAt, tz, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const span = `${fmtTime(b.startAt, tz)} – ${fmtTime(b.endAt, tz)} (${formatInTz(b.startAt, tz, { timeZoneName: "short" }).split(" ").pop()})`;

  const header = (
    <div className="space-y-4">
      {!inPane && <BackLink href="/admin/bookings">Bookings</BackLink>}
      <PaneHeader
        as="h1"
        media={
          <Avatar size="xl" aria-hidden>
            <AvatarFallback>{initialsOf(b.attendeeName)}</AvatarFallback>
          </Avatar>
        }
        title={
          b.contactId ? (
            <Link href={`/admin/contacts/${b.contactId}`} className="hover:underline">
              {b.attendeeName}
            </Link>
          ) : (
            b.attendeeName
          )
        }
        subtitle={
          <>
            {et?.title ?? "Meeting"}
            {b.seriesCount ? ` · Session ${b.seriesIndex} of ${b.seriesCount}` : ""}
          </>
        }
        status={status}
      />
      <div className="flex flex-wrap items-center gap-2">
        {b.meetingUrl && !past && live && (
          <Button
            nativeButton={false}
            render={<a href={b.meetingUrl} target="_blank" rel="noreferrer" />}
          >
            <VideoIcon data-icon="inline-start" />
            Join meeting
            <span className="sr-only">(opens in a new tab)</span>
          </Button>
        )}
        <BookingRowMenu
          trigger="more"
          label={`${et?.title ?? "Meeting"} with ${b.attendeeName}`}
          past={past}
          extra={[
            ...(b.contactId
              ? [{ href: `/admin/contacts/${b.contactId}`, label: "Open contact" }]
              : []),
            ...(inPane ? [{ href: `/admin/bookings/${b.id}`, label: "Open page" }] : []),
          ]}
          confirm={b.status === "pending" ? hostConfirm.bind(null, b.id) : undefined}
          noShow={
            past && (b.status === "confirmed" || b.status === "completed")
              ? hostMark.bind(null, b.id, "no_show")
              : undefined
          }
          undoNoShow={
            past && b.status === "no_show" ? hostMark.bind(null, b.id, "completed") : undefined
          }
          cancel={live && !past ? hostCancel.bind(null, b.id) : undefined}
        />
      </div>
      <dl className="space-y-2.5 text-sm">
        <div className="flex gap-3">
          <dt className="pt-0.5">
            <CalendarIcon className="size-4 text-muted-foreground" />
            <span className="sr-only">When</span>
          </dt>
          <dd>
            <span className="block">{day}</span>
            <span className="block text-muted-foreground">
              {span} · {minutes} min
            </span>
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="pt-0.5">
            <VideoIcon className="size-4 text-muted-foreground" />
            <span className="sr-only">Where</span>
          </dt>
          <dd className="min-w-0">
            <span className="block">{where}</span>
            {b.meetingUrl && (
              <span className="flex min-w-0 items-center gap-1">
                <a
                  href={b.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-primary underline-offset-4 hover:underline"
                >
                  {b.meetingUrl.replace(/^https?:\/\//, "")}
                </a>
                <CopyButton value={b.meetingUrl} label="Copy the meeting link" />
              </span>
            )}
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="pt-0.5">
            <UsersIcon className="size-4 text-muted-foreground" />
            <span className="sr-only">Who</span>
          </dt>
          <dd className="min-w-0">
            <span className="block">
              {b.attendeeName}
              {b.guests.length > 0 && (
                <span className="text-muted-foreground"> +{b.guests.length} more</span>
              )}
            </span>
            <a
              href={`mailto:${b.attendeeEmail}`}
              className="block truncate text-primary hover:underline"
            >
              {b.attendeeEmail}
            </a>
            {b.guests.length > 0 && (
              <span className="block truncate text-xs text-muted-foreground">
                With {b.guests.join(", ")}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );

  const briefing = (
    <div className="space-y-4">
      <section aria-labelledby="briefing-title" className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="briefing-title"
            className="flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            Briefing
            {assistantConfigured() && <AiLabel />}
          </h2>
          <form action={regenerateBrief.bind(null, b.id)}>
            <SubmitButton variant="outline" size="sm">
              Regenerate
            </SubmitButton>
          </form>
        </div>
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{brief}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {assistantConfigured()
            ? "Written by the assistant from this contact's timeline and answers."
            : "Plain summary. Set ANTHROPIC_API_KEY to get a written briefing."}
          {b.briefAt ? ` Updated ${fmtDateTime(b.briefAt, tz)}.` : ""}
        </p>
      </section>
      {(Object.keys(b.answers).length > 0 || sentFiles.length > 0) && (
        <section className="rounded-xl border bg-card p-5 text-sm">
          <h2 className="text-base font-semibold tracking-tight">Their answers</h2>
          <dl className="mt-2 space-y-1">
            {(et?.questions ?? []).map((q) =>
              b.answers[q.id] ? (
                <div key={q.id}>
                  <dt className="inline text-muted-foreground">{q.label}: </dt>
                  <dd className="inline">{b.answers[q.id]}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {sentFiles.length > 0 && (
            <ul className="mt-2 space-y-1" aria-label="Files they sent">
              {sentFiles.map((f) => (
                <li key={f.id}>
                  <a href={fileUrl(f.id)} className="underline underline-offset-2">
                    {f.name}
                  </a>{" "}
                  <span className="text-muted-foreground">
                    ({Math.max(1, Math.round(f.size / 1024))} KB)
                  </span>
                </li>
              ))}
            </ul>
          )}
          {b.notes && <p className="mt-2 text-muted-foreground">Note: {b.notes}</p>}
        </section>
      )}
    </div>
  );

  const notes = (
    <div className="space-y-4">
      {notesHere && <BookingNotes room={room!} />}
      {lastCapture && (
        <section className="rounded-xl border bg-card p-5 text-sm">
          <h2 className="text-base font-semibold tracking-tight">Captured</h2>
          <p className="mt-2 whitespace-pre-line">{lastCapture.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {fmtDateTime(lastCapture.createdAt, tz)}
          </p>
        </section>
      )}
      <TaskList
        tasks={tasks}
        tz={tz}
        path={`/admin/bookings/${b.id}`}
        contactId={b.contactId}
        bookingId={b.id}
        title="Action items"
      />
      {(past || b.status === "confirmed") && (
        <CaptureForm
          bookingId={b.id}
          assistant={assistantConfigured()}
          draft={draft}
          transcript={
            transcript && b.transcriptStatus === "ready"
              ? renderTranscript(transcript.segments, { host: "Host", attendee: b.attendeeName })
              : null
          }
        />
      )}
    </div>
  );

  const showTranscript =
    !!b.transcriptStatus || (!!et && et.autoCapture !== "off" && b.meetingProvider === "daily");
  const recapTab = (
    <div className="space-y-4">
      {recapRow ? (
        // Anchors for the contact timeline's "Recap" and "Transcript" links.
        <div id="recap" className="scroll-mt-20">
          <RecapPanel
            bookingId={b.id}
            row={recapRow}
            attendeeName={b.attendeeName}
            contactId={b.contactId}
            currentStage={contact?.stage ?? null}
          />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {past
            ? "No recap for this meeting. Capture your notes under Notes, or transcribe the next one."
            : "The recap appears here after the call: decisions, action items and a follow-up."}
        </p>
      )}
      {recap && (
        <AttendeeRecap
          bookingId={b.id}
          attendeeName={b.attendeeName}
          hostName={hostProfile?.displayName ?? "Host"}
          draft={recap.attendeeRecap}
          actions={recap.actions.map((a) => ({
            title: a.title,
            owner: a.owner,
            dueInDays: a.dueInDays,
          }))}
          sentAt={recapRow!.accepted.recapAt ?? null}
        />
      )}
      {showTranscript && (
        <div id="transcript" className="scroll-mt-20">
          <TranscriptPanel
            bookingId={b.id}
            status={b.transcriptStatus}
            consent={b.captureConsent}
            mode={et?.autoCapture ?? "off"}
            transcript={transcript}
            names={{ host: "You", attendee: b.attendeeName }}
            tz={tz}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className={inPane ? "space-y-5" : "max-w-3xl space-y-6"}>
      {header}
      {session && (
        <section className="rounded-xl border bg-card p-5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight">Who is in this session</h2>
            <StatusChip tone="accent">
              <UsersIcon className="size-3" aria-hidden />
              {session.taken} / {session.seats} seats
            </StatusChip>
          </div>
          <ul className="mt-3 divide-y rounded-lg border">
            {session.attendees.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  {a.id === b.id ? (
                    <span className="font-medium">{a.name}</span>
                  ) : (
                    <Link href={`/admin/bookings/${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                  )}
                  {a.company && <span className="text-muted-foreground"> · {a.company}</span>}
                  <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground capitalize">
                  {a.status === "confirmed" && <CheckIcon className="size-3" aria-hidden />}
                  {a.status}
                </span>
              </li>
            ))}
          </ul>
          {session.waiting > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-xs">
              <ClockIcon className="size-3 text-muted-foreground" aria-hidden />
              Waitlist: {session.waiting} {session.waiting === 1 ? "person" : "people"} · first in
              line is offered a seat if someone cancels
            </p>
          )}
        </section>
      )}
      <Tabs defaultValue={tab}>
        <TabsList variant="line">
          <TabsTrigger value="briefing">Briefing</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="recap">Recap</TabsTrigger>
        </TabsList>
        <TabsContent value="briefing" className="pt-4">
          {briefing}
        </TabsContent>
        <TabsContent value="notes" className="pt-4">
          {notes}
        </TabsContent>
        <TabsContent value="recap" className="pt-4">
          {recapTab}
        </TabsContent>
      </Tabs>
    </div>
  );
}
