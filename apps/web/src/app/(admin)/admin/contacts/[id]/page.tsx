import { PageSkeleton } from "@/components/page-skeleton";
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
} from "lucide-react";
import { BackLink } from "@/components/links";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CONTACT_STAGES } from "@bookly/db/schema";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/time";
import { TaskList } from "@/components/task-list";
import { listOpenTasks } from "@/server/capture";
import { contactBookings, contactTimeline, getContact } from "@/server/contacts";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { addNote, changeStage } from "../actions";
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
  const [events, bookings, tasks] = await Promise.all([
    contactTimeline(c.id),
    contactBookings(c.id),
    listOpenTasks(ws.id, { contactId: c.id }),
  ]);
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
            <h2 className="text-base font-semibold tracking-tight">Timeline</h2>
            <form action={addNote.bind(null, c.id)} className="mt-2 flex gap-2">
              <input
                name="text"
                placeholder="Add a note…"
                className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm"
              />
              <SubmitButton>Add</SubmitButton>
            </form>
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
                        {Object.entries(e.data.answers as Record<string, string>).map(([k, v]) => (
                          <div key={k}>
                            <dt className="inline font-medium">{k}: </dt>
                            <dd className="inline">{v || "—"}</dd>
                          </div>
                        ))}
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
                    <p className="text-xs text-muted-foreground">{fmtDateTime(e.createdAt, tz)}</p>
                  </div>
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-sm text-muted-foreground">Nothing yet.</li>
              )}
            </ol>
          </div>
        </section>
        <aside className="space-y-4">
          <Outreach
            contactId={c.id}
            proposal={templatesFor(ws).proposal}
            payment={templatesFor(ws).paymentRequest}
            followUp={templatesFor(ws).checkIn}
            initial={(await searchParams).compose === "followup" ? "followUp" : null}
            stripe={paymentsReady(ws)}
          />
          <TaskList tasks={tasks} tz={tz} path={`/admin/contacts/${c.id}`} contactId={c.id} />
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
    </div>
  );
}

export default function ContactPageBoundary(props: PageProps<"/admin/contacts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContactPage {...props} />
    </Suspense>
  );
}
