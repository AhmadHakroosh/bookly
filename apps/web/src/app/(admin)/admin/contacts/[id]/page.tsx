import { ContactSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import {
  ArrowRightIcon,
  BanknoteIcon,
  CalendarPlusIcon,
  CheckCircle2Icon,
  CheckIcon,
  CircleIcon,
  ClipboardCheckIcon,
  FileIcon,
  FileTextIcon,
  HourglassIcon,
  MailIcon,
  NotebookPenIcon,
  PencilLineIcon,
  RefreshCwIcon,
  SquareCheckIcon,
  UserXIcon,
  XCircleIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PaneHost } from "@/components/pane";
import { and, eq, inArray, schema } from "@bookly/db";
import { cn } from "cn";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { FileTypeIcon } from "@/components/ui/file-row";
import { CLIENT_JOURNEY, JourneyStrip, type JourneyStep } from "@/components/ui/journey-strip";
import { StatusChip } from "@/components/ui/status-chip";
import { db } from "@/lib/db";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime, formatInTz } from "@/lib/time";
import { TaskList } from "@/components/task-list";
import { listOpenTasks } from "@/server/capture";
import { contactBookings, contactTimeline, contactVisible, getContact } from "@/server/contacts";
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
import { addTaskAction } from "../../scheduling-actions";
import { NextSteps } from "../../home-lists";
import { ContactMenu, StageChip } from "./contact-header";
import { stageChoices } from "@/server/pipelines";

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
  automation: ZapIcon,
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
  // People who exist only as candidates open only for their team (ADR 0005).
  if (!c || !(await contactVisible(ws.id, c.id, session.user.id))) notFound();
  const stages = await stageChoices(ws);
  const sp = await searchParams;
  const v2 = await hasFlag(ws, "timeline_v2");
  const canReply = v2 && hasFeature(ws, "inboundEmail") && (await inboundOn(ws));
  const [events, firstWindow, bookings, tasks] = await Promise.all([
    v2 ? Promise.resolve([]) : contactTimeline(c.id, 100, session.user.id),
    v2 ? timelineWindow(ws.id, c.id, tz, null, undefined, session.user.id) : Promise.resolve(null),
    contactBookings(c.id, session.user.id),
    listOpenTasks(ws.id, { contactId: c.id }),
  ]);
  const entryId = typeof sp.entry === "string" ? sp.entry : null;
  const filesOn = (await hasFlag(ws, "files")) && hasFeature(ws, "attachments");
  const messagesOn = (await hasFlag(ws, "messages")) && canGuest(ws);
  const now = new Date();
  const tab = TABS.find((t) => t === sp.tab) ?? "overview";
  const [outreach, files] = await Promise.all([
    db()
      .select({ type: schema.contactEvents.type, data: schema.contactEvents.data })
      .from(schema.contactEvents)
      .where(
        and(
          eq(schema.contactEvents.contactId, c.id),
          inArray(schema.contactEvents.type, ["email_sent", "payment"]),
        ),
      ),
    filesOn
      ? listContactFiles({ userId: session.user.id, ws }, c.id, "all")
      : Promise.resolve(null),
  ]);
  const journey = journeyOf(c.id, bookings, outreach, now, tz);
  const stageKey = stages.keyOf(c);
  const stage = stages.choices.find((s) => s.key === stageKey);
  const latestFiles = files
    ? [...files.files]
        .sort((x, y) => +(y.readyAt ?? y.createdAt) - +(x.readyAt ?? x.createdAt))
        .slice(0, 5)
    : [];
  const suggest: "proposal" | "payment" | "followUp" =
    journey[2]!.state === "done" && journey[3]!.state !== "done"
      ? "proposal"
      : journey[3]!.state === "done" && journey[4]!.state !== "done"
        ? "payment"
        : "followUp";
  const short = (d: Date) => formatInTz(d, tz, { month: "short", day: "numeric" });
  const href = (t: (typeof TABS)[number]) =>
    t === "overview" ? `/admin/contacts/${c.id}` : `/admin/contacts/${c.id}?tab=${t}`;
  const counts: Record<(typeof TABS)[number], number | null> = {
    overview: null,
    bookings: bookings.length,
    tasks: tasks.length,
    files: files ? files.files.length : null,
  };
  const name = c.name || c.email;
  return (
    <div className="space-y-5">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:gap-x-6">
        <Avatar className="size-14 md:size-20" aria-hidden>
          <AvatarFallback className="bg-accent text-xl font-semibold text-accent-foreground">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold tracking-[-0.02em] break-words md:text-[2rem] md:leading-10">
            {name}
          </h1>
          {c.company && <p className="text-muted-foreground">{c.company}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StageChip
              stage={stageKey}
              category={stage?.emphasis ? "won" : stageKey === "lost" ? "lost" : "open"}
              choices={stages.choices}
              change={changeStage.bind(null, c.id)}
            />
            {c.emailOptOut && <StatusChip tone="neutral">Unsubscribed from emails</StatusChip>}
            {c.tags.map((t) => (
              <StatusChip key={t} tone="neutral">
                {t}
              </StatusChip>
            ))}
          </div>
        </div>
        <dl className="order-last col-span-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm md:order-none md:col-span-1 md:max-w-xs">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate">
            <a href={`mailto:${c.email}`} className="hover:underline">
              {c.email}
            </a>
          </dd>
          {c.phone && (
            <>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>
                <a href={`tel:${c.phone}`} className="hover:underline">
                  {c.phone}
                </a>
              </dd>
            </>
          )}
        </dl>
        <ContactMenu
          optedOut={c.emailOptOut}
          toggleOptOut={setContactEmailOptOut.bind(null, c.id, !c.emailOptOut)}
          links={[
            ...(filesOn ? [{ href: `/admin/files?contact=${c.id}`, label: "Open folder" }] : []),
            { href: "/admin/contacts", label: "All contacts" },
          ]}
        />
      </header>

      <JourneyStrip steps={journey} />

      <nav
        aria-label="Contact"
        className="flex [scrollbar-width:none] gap-1 overflow-x-auto border-b"
      >
        {TABS.map((t) => (
          <Link
            key={t}
            href={href(t)}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
            {counts[t] !== null && <span className="ms-1 tabular-nums">({counts[t]})</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <section
            aria-labelledby="timeline-title"
            className="min-w-0 rounded-xl border bg-card p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="timeline-title" className="text-lg font-semibold tracking-tight">
                Timeline
              </h2>
              {messagesOn && <OpenConversationButton contactId={c.id} />}
            </div>
            <form action={addNote.bind(null, c.id)} className="mt-3 flex gap-2">
              <input
                name="text"
                aria-label="Note"
                placeholder="Add a note…"
                className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
              />
              <SubmitButton variant="outline">Add</SubmitButton>
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
          </section>

          <aside className="min-w-0 space-y-4">
            <Outreach
              contactId={c.id}
              proposal={templatesFor(ws).proposal}
              payment={templatesFor(ws).paymentRequest}
              followUp={templatesFor(ws).checkIn}
              initial={sp.compose === "followup" ? "followUp" : null}
              suggest={suggest}
              optedOut={c.emailOptOut}
              stripe={paymentsReady(ws)}
              filesOn={filesOn}
            />
            <SideCard
              id="linked-tasks"
              title={`Linked tasks (${tasks.length})`}
              more={tasks.length > 4 ? href("tasks") : undefined}
            >
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open tasks.</p>
              ) : (
                <NextSteps
                  path={`/admin/contacts/${c.id}`}
                  steps={tasks.slice(0, 4).map((t) => ({
                    id: t.id,
                    title: t.title,
                    due: t.dueAt ? short(t.dueAt) : undefined,
                    urgent: !!t.dueAt && t.dueAt < new Date(now.getTime() + 86_400_000),
                  }))}
                />
              )}
              <form action={addTaskAction} className="mt-2 flex gap-2 border-t pt-3">
                <input type="hidden" name="contactId" value={c.id} />
                <input
                  name="title"
                  required
                  aria-label="New task"
                  placeholder="Add a task…"
                  className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
                />
                <SubmitButton variant="outline" size="sm">
                  Add
                </SubmitButton>
              </form>
            </SideCard>
            {files && (
              <SideCard
                id="recent-files"
                title={`Recent files (${files.files.length}${files.next ? "+" : ""})`}
                more={href("files")}
              >
                {latestFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Files they send you and files you keep for them land here.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {latestFiles.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                        <FileTypeIcon name={f.name} />
                        <span className="min-w-0 flex-1 truncate">
                          <FileLink file={f} className="font-medium hover:underline" />
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {short(f.readyAt ?? f.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3">
                  <UploadButton target={{ contactId: c.id }} variant="outline" size="sm" />
                </div>
              </SideCard>
            )}
            <SideCard id="client-details" title="Client details">
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
                  nextFollowUpAt: c.nextFollowUpAt
                    ? c.nextFollowUpAt.toISOString().slice(0, 10)
                    : "",
                }}
              />
            </SideCard>
          </aside>
        </div>
      )}

      {tab === "bookings" && (
        <section aria-label="Bookings" className="rounded-xl border bg-card">
          {bookings.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <ul className="divide-y">
              {[...bookings].reverse().map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm hover:bg-muted/40"
                  >
                    <span className="w-44 shrink-0 tabular-nums">{fmtDateTime(b.startAt, tz)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {b.eventTitle ?? "Meeting"}
                    </span>
                    <StatusChip
                      tone={
                        b.status === "confirmed"
                          ? b.endAt > now
                            ? "success"
                            : "neutral"
                          : b.status === "pending"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {b.status === "confirmed" && b.endAt <= now
                        ? "Done"
                        : b.status.replace("_", " ").replace(/^./, (x) => x.toUpperCase())}
                    </StatusChip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "tasks" && (
        <TaskList
          tasks={tasks}
          tz={tz}
          path={`/admin/contacts/${c.id}?tab=tasks`}
          contactId={c.id}
        />
      )}

      {tab === "files" && filesOn && (
        <Suspense fallback={null}>
          <ContactFiles viewer={{ userId: session.user.id, ws }} contactId={c.id} />
        </Suspense>
      )}

      <PaneHost param="entry" id={v2 ? (entryId ?? null) : null} label="Timeline entry">
        {v2 && entryId && (
          <EntryPane
            workspaceId={ws.id}
            contactId={c.id}
            entryId={entryId}
            viewer={session.user.id}
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

const TABS = ["overview", "bookings", "tasks", "files"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  overview: "Overview",
  bookings: "Bookings",
  tasks: "Tasks",
  files: "Files",
};

/** A card in the contact's right column: a title, an optional "View all", its content. */
function SideCard({
  id,
  title,
  more,
  children,
}: {
  id: string;
  title: string;
  more?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {more && (
          <Link
            href={more}
            className="inline-flex items-center gap-0.5 text-sm text-primary hover:underline"
          >
            View all
            <ArrowRightIcon className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Where the contact is in the client journey (decision D3): booked, prepared (a briefing),
 * met (a meeting held), followed up (a proposal or follow-up sent), paid. Each done step links
 * to the record that made it so; the first step not done is the current one.
 */
function journeyOf(
  contactId: string,
  bookings: {
    id: string;
    startAt: Date;
    endAt: Date;
    status: string;
    brief: string | null;
    paymentStatus: string | null;
  }[],
  events: { type: string; data: unknown }[],
  now: Date,
  tz: string,
): JourneyStep[] {
  const day = (d: Date) => formatInTz(d, tz, { month: "short", day: "numeric" });
  const kept = bookings.filter((b) => b.status !== "cancelled");
  const booked = kept[0];
  const briefed = kept.find((b) => b.brief);
  const met = [...kept]
    .reverse()
    .find((b) => b.endAt <= now && b.status !== "no_show" && b.status !== "pending");
  const kindOf = (e: { data: unknown }) => (e.data as { kind?: string } | null)?.kind;
  const followed = events.some(
    (e) =>
      e.type === "email_sent" &&
      (kindOf(e) === "proposal" || kindOf(e) === "checkIn" || kindOf(e) === "paymentRequest"),
  );
  const paid =
    events.some((e) => e.type === "payment") || kept.some((b) => b.paymentStatus === "paid");
  const done = [!!booked, !!briefed, !!met, followed, paid];
  const current = done.indexOf(false);
  const detail = [
    booked ? `Meeting ${day(booked.startAt)}` : "No meeting yet",
    briefed ? "Briefing ready" : "Briefing before the call",
    met ? `Met ${day(met.endAt)}` : "Notes after the call",
    followed ? "Proposal or follow-up sent" : "Proposal or follow-up",
    paid ? "Payment received" : "Payment request",
  ];
  const links = [
    booked && `/admin/bookings/${booked.id}`,
    briefed && `/admin/bookings/${briefed.id}`,
    met && `/admin/bookings/${met.id}`,
    undefined,
    undefined,
  ];
  return CLIENT_JOURNEY.map((label, i) => ({
    label,
    state: done[i] ? "done" : i === current ? "current" : "todo",
    detail: detail[i],
    href:
      links[i] ||
      (i === 3 || i === 4 ? `/admin/contacts/${contactId}?compose=followup` : undefined),
  }));
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
  viewer,
  tz,
  canReply,
  filesOn,
  closeHref,
}: {
  workspaceId: string;
  contactId: string;
  entryId: string;
  viewer: string;
  tz: string;
  canReply: boolean;
  filesOn: boolean;
  closeHref: string;
}) {
  const found = await timelineEntry(workspaceId, contactId, entryId, viewer);
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
