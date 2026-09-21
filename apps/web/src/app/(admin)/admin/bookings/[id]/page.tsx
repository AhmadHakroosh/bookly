import Link from "next/link";
import { BackLink, ExternalLink } from "@/components/links";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq, schema } from "@bookly/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { TaskList } from "@/components/task-list";
import { assistantConfigured, briefForBooking } from "@/server/brief";
import { listOpenTasks } from "@/server/capture";
import { contactTimeline } from "@/server/contacts";
import { CaptureForm } from "./capture-form";
import { locationLabel } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { regenerateBrief } from "../../scheduling-actions";

export const metadata = { title: "Meeting brief" };

async function BookingBriefPage({ params }: PageProps<"/admin/bookings/[id]">) {
  const [{ id }, , ws] = await Promise.all([params, requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const b = await db().query.bookings.findFirst({
    where: and(eq(schema.bookings.id, id), eq(schema.bookings.workspaceId, ws.id)),
  });
  if (!b) notFound();
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
  const [brief, tasks, timeline] = await Promise.all([
    briefForBooking(ws, b, et ?? null),
    listOpenTasks(ws.id, { bookingId: b.id }),
    b.contactId ? contactTimeline(b.contactId, 50) : Promise.resolve([]),
  ]);
  const lastCapture = timeline.find((e) => e.type === "capture" && e.bookingId === b.id);
  const draft =
    (
      lastCapture?.data as
        { capture?: { followUp?: { subject: string; body: string } | null } } | undefined
    )?.capture?.followUp ?? null;
  const past = b.endAt <= new Date() || b.status === "completed" || b.status === "no_show";
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <BackLink href="/admin/bookings">Bookings</BackLink>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {et?.title ?? "Meeting"} with{" "}
          {b.contactId ? (
            <Link href={`/admin/contacts/${b.contactId}`} className="hover:underline">
              {b.attendeeName}
            </Link>
          ) : (
            b.attendeeName
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {fmtDateTime(b.startAt, ws.timezone)} ·{" "}
          {b.meetingUrl ? (
            <ExternalLink href={b.meetingUrl}>Join meeting</ExternalLink>
          ) : (
            locationLabel(b.location)
          )}{" "}
          ·{" "}
          <Badge variant="secondary" className="capitalize">
            {b.status.replace("_", " ")}
          </Badge>
        </p>
      </div>
      <section className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Briefing</h2>
          <form action={regenerateBrief.bind(null, b.id)}>
            <Button type="submit" size="sm" variant="outline">
              Regenerate
            </Button>
          </form>
        </div>
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{brief}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {assistantConfigured()
            ? "Written by the assistant from this contact's timeline and answers."
            : "Plain summary. Set ANTHROPIC_API_KEY to get a written briefing."}
          {b.briefAt ? ` Updated ${fmtDateTime(b.briefAt, ws.timezone)}.` : ""}
        </p>
      </section>
      {lastCapture && (
        <section className="rounded-xl border p-5 text-sm">
          <h2 className="font-medium">Captured</h2>
          <p className="mt-2 whitespace-pre-line">{lastCapture.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {fmtDateTime(lastCapture.createdAt, ws.timezone)}
          </p>
        </section>
      )}
      <TaskList
        tasks={tasks}
        tz={ws.timezone}
        path={`/admin/bookings/${b.id}`}
        contactId={b.contactId}
        bookingId={b.id}
        title="Action items"
      />
      {(past || b.status === "confirmed") && (
        <CaptureForm bookingId={b.id} assistant={assistantConfigured()} draft={draft} />
      )}
      {Object.keys(b.answers).length > 0 && (
        <section className="rounded-xl border p-5 text-sm">
          <h2 className="font-medium">Their answers</h2>
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
          {b.notes && <p className="mt-2 text-muted-foreground">Note: {b.notes}</p>}
        </section>
      )}
    </div>
  );
}

export default function BookingBriefPageBoundary(props: PageProps<"/admin/bookings/[id]">) {
  return (
    <Suspense fallback={null}>
      <BookingBriefPage {...props} />
    </Suspense>
  );
}
