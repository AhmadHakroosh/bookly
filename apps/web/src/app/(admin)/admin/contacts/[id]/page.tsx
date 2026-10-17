import { ContactSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarPlusIcon,
  CheckCircle2Icon,
  CheckIcon,
  CircleIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  HourglassIcon,
  MailIcon,
  NotebookPenIcon,
  PencilLineIcon,
  RefreshCwIcon,
  SquareCheckIcon,
  UserXIcon,
  XCircleIcon,
  type LucideIcon,
  BanknoteIcon,
  FileIcon,
} from "lucide-react";
import { BackLink } from "@/components/links";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PaneHost } from "@/components/pane";
import { CONTACT_STAGES } from "@bookly/db/schema";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/time";
import { TaskList } from "@/components/task-list";
import { listOpenTasks } from "@/server/capture";
import { contactBookings, contactTimeline, getContact } from "@/server/contacts";
import { PLANS, planFor } from "@bookly/cloud";
import { hasFlag } from "@/server/flags";
import { inboundOn } from "@/server/inbound";
import { hasFeature } from "@/server/limits";
import {
  addFileTypes,
  attachmentsOf,
  tidy,
  timelineEntry,
  timelineWindow,
} from "@/server/timeline";
import { BookingDetail } from "../../bookings/booking-detail";
import { BookingPane } from "../../bookings/booking-pane";
import { EntrySheet, PaneReply } from "./entry-pane";
import { OpenConversationButton } from "../../messages/open-conversation";
import { Attachments, TimelineView } from "./timeline-view";
import { formatBytes } from "@bookly/cloud";
import { FileLink } from "@/components/drive/file-viewer";
import { UploadButton } from "@/components/drive/upload-button";
import { listContactFiles, type Viewer } from "@/server/drive";
import { canGuest } from "@/server/messages";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { addNote, changeStage, setContactEmailOptOut } from "../actions";
import { templatesFor } from "@/server/outreach";
import { paymentsReady } from "@/server/payments";
import { ContactDetailsForm } from "./details-form";
import { Outreach } from "./outreach";
import { Dropdown } from "@/components/dropdown";

export const metadata = { title: "Contact" };

const ICON: Record<string, LucideIcon> = {
  booked: CalendarPlusIcon,
  confirmed: CheckCircle2Icon,
  cancelled: XCircleIcon,
  rescheduled: RefreshCwIcon,
  completed: CheckIcon,
  no_show: UserXIcon,
  email_sent: MailIcon,
  note: PencilLineIcon,
  stage_changed: ArrowRightIcon,
  waitlist_joined: HourglassIcon,
  form_submitted: ClipboardCheckIcon,
  brief: FileTextIcon,
  capture: NotebookPenIcon,
  task: SquareCheckIcon,
  payment: BanknoteIcon,
  file: FileIcon,
};

async function ContactPage({ params, searchParams }: PageProps<"/admin/contacts/[id]">) {
  const [{ id }, { session }, ws] = await Promise.all([
    params,
    requireStaff(),
    getCurrentWorkspace(),
  ]);
  if (!ws) return null;
  const tz = (await getProfileByUser(ws.id, session.user.id))?.timezone ?? ws.timezone;
  const c = await getContact(ws.id, id);
  if (!c) notFound();
  const sp = await searchParams;
  const v2 = await hasFlag(ws, "timeline_v2");
  const canReply = v2 && hasFeature(ws, "inboundEmail") && (await inboundOn(ws));
  const [events, firstWindow, bookings, tasks] = await Promise.all([
    v2 ? Promise.resolve([]) : contactTimeline(c.id),
    v2 ? timelineWindow(ws.id, c.id, tz) : Promise.resolve(null),
    contactBookings(c.id),
    listOpenTasks(ws.id, { contactId: c.id }),
  ]);
  const entryId = typeof sp.entry === "string" ? sp.entry : null;
  const filesOn = (await hasFlag(ws, "files")) && hasFeature(ws, "attachments");
  const messagesOn = (await hasFlag(ws, "messages")) && canGuest(ws);
  const now = new Date();
  const upcoming = bookings.filter(
    (b) => b.endAt > now && (b.status === "confirmed" || b.status === "pending"),
  );
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <BackLink href="/admin/contacts">Contacts</BackLink>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.name || c.email}</h1>
          <p className="text-sm text-muted-foreground">
            {c.email}
            {c.company ? ` · ${c.company}` : ""}
            {c.phone ? ` · ${c.phone}` : ""}
          </p>
          <form
            action={setContactEmailOptOut.bind(null, c.id, !c.emailOptOut)}
            className="mt-2 flex flex-wrap items-center gap-2 text-xs"
          >
            {c.emailOptOut ? (
              <>
                <Badge variant="secondary">Unsubscribed from emails</Badge>
                <SubmitButton variant="ghost" size="sm">
                  Opt back in
                </SubmitButton>
              </>
            ) : (
              <SubmitButton variant="ghost" size="sm" className="text-muted-foreground">
                Opt out of emails
              </SubmitButton>
            )}
          </form>
        </div>
        <form action={changeStage.bind(null, c.id)} className="flex items-center gap-2 text-sm">
          <label htmlFor="stage" className="text-muted-foreground">
            Stage
          </label>
          <Dropdown
            id="stage"
            name="stage"
            defaultValue={c.stage}
            className="w-36 capitalize"
            contentClassName="capitalize"
            options={CONTACT_STAGES.map((s) => ({ value: s, label: s }))}
          />
          <SubmitButton variant="outline">Update</SubmitButton>
        </form>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-base font-semibold tracking-tight">Upcoming</h2>
              <ul className="mt-2 divide-y rounded-xl border text-sm">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                      {b.eventTitle ?? "Meeting"} · {fmtDateTime(b.startAt, tz)}
                    </Link>
                    <Badge
                      variant={b.status === "confirmed" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {b.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight">Timeline</h2>
              {messagesOn && <OpenConversationButton contactId={c.id} />}
            </div>
            <form action={addNote.bind(null, c.id)} className="mt-2 flex gap-2">
              <input
                name="text"
                placeholder="Add a note…"
                className="flex-1 rounded-lg border bg-background px-3 text-sm"
              />
              <SubmitButton>Add</SubmitButton>
            </form>
            {firstWindow ? (
              <>
                {!hasFeature(ws, "inboundEmail") && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Guests&apos; replies to your emails land here with{" "}
                    {PLANS[planFor("inboundEmail")].name}.{" "}
                    <Link href="/admin/billing" className="underline underline-offset-4">
                      Upgrade
                    </Link>
                  </p>
                )}
                <TimelineView
                  key={timelineKey(firstWindow)}
                  contactId={c.id}
                  initial={firstWindow}
                  canReply={canReply}
                  filesOn={filesOn}
                />
              </>
            ) : (
              <ol className="mt-3 space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className="mt-0.5 w-5 shrink-0 text-muted-foreground" aria-hidden>
                      {(() => {
                        const Icon = ICON[e.type] ?? CircleIcon;
                        return <Icon className="size-4" />;
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-line">{e.summary}</p>
                      {e.type === "form_submitted" && e.data.answers ? (
                        <dl className="mt-1 text-xs text-muted-foreground">
                          {Object.entries(e.data.answers as Record<string, string>).map(
                            ([k, v]) => (
                              <div key={k}>
                                <dt className="inline font-medium">{k}: </dt>
                                <dd className="inline">{v || "—"}</dd>
                              </div>
                            ),
                          )}
                        </dl>
                      ) : null}
                      {e.type === "booked" &&
                      e.data.answers &&
                      Object.keys(e.data.answers as object).length ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {Object.values(e.data.answers as Record<string, string>)
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {fmtDateTime(e.createdAt, tz)}
                      </p>
                    </div>
                  </li>
                ))}
                {events.length === 0 && (
                  <li className="text-sm text-muted-foreground">Nothing yet.</li>
                )}
              </ol>
            )}
          </div>
        </section>
        <aside className="space-y-4">
          <Outreach
            contactId={c.id}
            proposal={templatesFor(ws).proposal}
            payment={templatesFor(ws).paymentRequest}
            followUp={templatesFor(ws).checkIn}
            initial={(await searchParams).compose === "followup" ? "followUp" : null}
            optedOut={c.emailOptOut}
            stripe={paymentsReady(ws)}
            filesOn={filesOn}
          />
          <TaskList tasks={tasks} tz={tz} path={`/admin/contacts/${c.id}`} contactId={c.id} />
          {filesOn && (
            <Suspense fallback={null}>
              <ContactFiles viewer={{ userId: session.user.id, ws }} contactId={c.id} />
            </Suspense>
          )}
          {/* Keyed by the stored values: a send or stage change refreshes the page with new
              defaults, and uncontrolled inputs must remount to pick them up. */}
          <ContactDetailsForm
            key={`${c.updatedAt?.toISOString() ?? ""}:${c.nextFollowUpAt?.toISOString() ?? ""}`}
            contact={{
              id: c.id,
              name: c.name,
              company: c.company ?? "",
              phone: c.phone ?? "",
              tags: c.tags.join(", "),
              notes: c.notes ?? "",
              nextFollowUpAt: c.nextFollowUpAt ? c.nextFollowUpAt.toISOString().slice(0, 10) : "",
            }}
          />
        </aside>
      </div>
      <PaneHost param="entry" id={v2 ? (entryId ?? null) : null} label="Timeline entry">
        {v2 && entryId && (
          <EntryPane
            workspaceId={ws.id}
            contactId={c.id}
            entryId={entryId}
            tz={tz}
            canReply={canReply}
            filesOn={filesOn}
            closeHref={`/admin/contacts/${c.id}`}
          />
        )}
      </PaneHost>
    </div>
  );
}

/** The contact's folder on their page: the latest files, upload, and a link to the whole folder. */
async function ContactFiles({ viewer, contactId }: { viewer: Viewer; contactId: string }) {
  const { files, next } = await listContactFiles(viewer, contactId, "all");
  const latest = [...files]
    .sort((a, b) => +(b.readyAt ?? b.createdAt) - +(a.readyAt ?? a.createdAt))
    .slice(0, 8);
  return (
    <section className="rounded-xl border p-4" aria-labelledby="contact-files">
      <div className="flex items-center justify-between gap-2">
        <h2 id="contact-files" className="text-base font-semibold tracking-tight">
          Files
        </h2>
        <Link
          href={`/admin/files?contact=${contactId}`}
          className="text-xs underline underline-offset-4"
        >
          Open folder{files.length ? ` (${files.length}${next ? "+" : ""})` : ""}
        </Link>
      </div>
      {latest.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Files they send you and files you keep for them land here.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {latest.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                <FileLink file={f} className="hover:underline" />
              </span>
              <span className="text-xs text-muted-foreground">
                {f.source === "email" || f.source === "message" || f.source === "booking"
                  ? "from them"
                  : formatBytes(f.size)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <UploadButton target={{ contactId }} variant="outline" size="sm" />
      </div>
    </section>
  );
}

/** Changes whenever the first window does, so the client view restarts from fresh data. */
function timelineKey(w: { days: { items: { id: string; replies: unknown[] }[] }[] }) {
  return w.days.flatMap((d) => d.items.map((i) => `${i.id}:${i.replies.length}`)).join(",");
}

/** A timeline entry in the side pane: a meeting's booking, or an email with its whole thread. */
async function EntryPane({
  workspaceId,
  contactId,
  entryId,
  tz,
  canReply,
  filesOn,
  closeHref,
}: {
  workspaceId: string;
  contactId: string;
  entryId: string;
  tz: string;
  canReply: boolean;
  filesOn: boolean;
  closeHref: string;
}) {
  const found = await timelineEntry(workspaceId, contactId, entryId);
  if (!found)
    return (
      <EntrySheet title="Entry not found" closeHref={closeHref}>
        <p className="text-sm text-muted-foreground">This entry is no longer on the timeline.</p>
      </EntrySheet>
    );
  const { entry, thread } = found;
  const email = entry.type === "email_sent" || entry.type === "email_received";
  if (!email && entry.bookingId)
    return (
      <BookingPane
        title={entry.summary}
        closeHref={closeHref}
        prevHref={null}
        nextHref={null}
        fullHref={`/admin/bookings/${entry.bookingId}`}
        position={null}
      >
        <BookingDetail id={entry.bookingId} inPane />
      </BookingPane>
    );
  const items = email ? thread : [entry];
  const last = items[items.length - 1]!;
  const files = items.map((e) => ({ attachments: attachmentsOf(e.data), file: null }));
  await addFileTypes(workspaceId, files);
  return (
    <EntrySheet title={entry.summary} closeHref={closeHref}>
      <div className="space-y-5">
        <h1 className="text-lg font-semibold tracking-tight">{entry.summary}</h1>
        <ol className="space-y-4">
          {items.map((e, i) => {
            const d = e.data as {
              subject?: string;
              body?: string;
              full?: string;
              from?: string;
              to?: string;
            };
            return (
              <li
                key={e.id}
                className={`rounded-xl border p-4 text-sm ${e.id === entry.id ? "ring-2 ring-ring/30" : ""}`}
              >
                <p className="text-xs text-muted-foreground">
                  {e.type === "email_received"
                    ? `From ${d.from ?? "them"}`
                    : e.type === "email_sent"
                      ? `Sent${d.to ? ` to ${d.to}` : ""}`
                      : e.type.replace("_", " ")}{" "}
                  · {fmtDateTime(e.createdAt, tz)}
                </p>
                {d.subject && <p className="mt-1 font-medium">{d.subject}</p>}
                <p className="mt-2 break-words whitespace-pre-line">
                  {tidy(d.body ?? null) ?? e.summary}
                </p>
                {d.full && d.full.trim() !== (d.body ?? "").trim() && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Show the quoted text</summary>
                    <p className="mt-1 break-words whitespace-pre-line">{tidy(d.full)}</p>
                  </details>
                )}
                <Attachments files={files[i]!.attachments} />
              </li>
            );
          })}
        </ol>
        {canReply && email && (
          <PaneReply contactId={contactId} parentId={last.id} filesOn={filesOn} />
        )}
      </div>
    </EntrySheet>
  );
}

export default function ContactPageBoundary(props: PageProps<"/admin/contacts/[id]">) {
  return (
    <Suspense fallback={<ContactSkeleton />}>
      <ContactPage {...props} />
    </Suspense>
  );
}
