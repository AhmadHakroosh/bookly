import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PLANS, planFor } from "@bookly/cloud";
import {
  ChevronLeftIcon,
  MailIcon,
  MessagesSquareIcon,
  PhoneIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { EmptyState } from "@/components/ui/empty-state";
import { FileTypeIcon } from "@/components/ui/file-row";
import { StatusChip } from "@/components/ui/status-chip";
import { FileLink } from "@/components/drive/file-viewer";
import { contactBookings, getContact } from "@/server/contacts";
import { listContactFiles } from "@/server/drive";
import { stageChoices } from "@/server/pipelines";
import { BetaBadge } from "@/components/beta-badge";
import { InlinePane } from "@/components/pane";
import { BookingsSkeleton } from "@/components/skeletons/pages";
import { Input } from "@/components/ui/input";
import { fmtDateTime, fmtTime, formatInTz, todayIn, utcToZoned } from "@/lib/time";
import { cn } from "@/lib/utils";
import { hasFlag, inBeta } from "@/server/flags";
import { inboundOn } from "@/server/inbound";
import { hasFeature } from "@/server/limits";
import {
  BOXES,
  canGuest,
  canTeam,
  latestActivity,
  listThreads,
  markThreadRead,
  threadDetails,
  threadItems,
  unreadThreads,
  type ThreadBox,
  type ThreadItem,
  type Viewer,
} from "@/server/messages";
import { getProfileByUser, listProfiles } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { Attachments } from "../contacts/[id]/timeline-view";
import { GuestComposer, TeamComposer } from "./composer";
import { NewMessageButton } from "./new-message";
import { LiveRefresh } from "./thread-sheet";
import { AddPeopleButton, CloseButton } from "./thread-controls";
import { PageHeader } from "@/components/ui/page-header";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

async function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams as Promise<SP>,
  ]);
  if (!ws) return null;
  if (!(await hasFlag(ws, "messages"))) redirect("/admin");
  const v: Viewer = { userId: session.user.id, ws };
  const guest = canGuest(ws);
  const team = canTeam(ws);

  if (!guest && !team)
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          One conversation per client, shared by your team: their emails in and out, what they wrote
          when booking, and your internal notes. Messages with your clients come with{" "}
          {PLANS[planFor("guestMessages")].name}; team threads with{" "}
          {PLANS[planFor("teamMessages")].name}.{" "}
          <Link href="/admin/billing" className="underline underline-offset-4">
            Upgrade
          </Link>
        </p>
      </div>
    );

  const box = BOXES.find((b) => b === one(sp.box)) ?? "inbox";
  const q = one(sp.q)?.trim() ?? "";
  const [beta, unread, list, profile, people, latest] = await Promise.all([
    inBeta(ws, "messages"),
    unreadThreads(v),
    listThreads(v, { box, q, after: one(sp.after) }),
    getProfileByUser(ws.id, session.user.id),
    listProfiles(ws.id),
    latestActivity(v),
  ]);
  const tz = profile?.timezone ?? ws.timezone;
  const hrefFor = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base = { box: box === "inbox" ? null : box, q: q || null };
    for (const [k, val] of Object.entries({ ...base, ...patch })) if (val) p.set(k, val);
    const s = p.toString();
    return `/admin/messages${s ? `?${s}` : ""}`;
  };
  const threadId = one(sp.thread);
  const today = todayIn(tz);
  const short = (d: Date) =>
    utcToZoned(d, tz).date === today
      ? fmtTime(d, tz)
      : formatInTz(d, tz, { month: "short", day: "numeric" });
  // The open thread counts as read (it is marked so while the pane renders).
  const shownUnread = Math.max(
    0,
    unread - (list.rows.some((r) => r.id === threadId && r.unread) ? 1 : 0),
  );
  const others = people
    .filter((p) => p.userId !== session.user.id)
    .map((p) => ({ id: p.userId, name: p.displayName }));

  const tabs: { box: ThreadBox; label: string }[] = [
    { box: "inbox", label: "All" },
    ...(guest ? [{ box: "guests" as const, label: "Clients" }] : []),
    ...(team ? [{ box: "team" as const, label: "Team" }] : []),
  ];

  return (
    <div className="space-y-5">
      <LiveRefresh rendered={latest} />
      <PageHeader
        title="Messages"
        badge={beta && <BetaBadge />}
        description={<>{shownUnread ? `${shownUnread} unread` : "All caught up"}</>}
        actions={
          <NewMessageButton
            canGuest={guest}
            canTeam={team}
            teamPlan={PLANS[planFor("teamMessages")].name}
            people={others}
            defaultOpen={one(sp.new) === "1"}
          />
        }
      />
      <div className="grid items-stretch gap-4 lg:h-[calc(100dvh-12.5rem)] lg:min-h-[34rem] lg:grid-cols-[21rem_minmax(0,1fr)]">
        <section
          aria-label="Inbox"
          className={cn(
            "flex min-h-0 flex-col rounded-xl border bg-card",
            threadId && "hidden lg:flex",
          )}
        >
          <div className="space-y-3 border-b p-3">
            <nav aria-label="Mailboxes" className="flex gap-1.5">
              {tabs.map((t) => (
                <Link
                  key={t.box}
                  href={t.box === "inbox" ? "/admin/messages" : `/admin/messages?box=${t.box}`}
                  aria-current={box === t.box ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    box === t.box
                      ? "border-primary/40 bg-accent text-accent-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <form method="get" action="/admin/messages" className="relative" role="search">
              <SearchIcon
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              {box !== "inbox" && <input type="hidden" name="box" value={box} />}
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search conversations…"
                aria-label="Search messages"
                className="h-8 pl-9"
              />
            </form>
            <p className="flex gap-3 text-xs">
              <Link
                href="/admin/messages?box=unread"
                aria-current={box === "unread" ? "page" : undefined}
                className={cn(
                  "hover:text-foreground",
                  box === "unread" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                Unread{shownUnread > 0 ? ` (${shownUnread})` : ""}
              </Link>
              <Link
                href="/admin/messages?box=closed"
                aria-current={box === "closed" ? "page" : undefined}
                className={cn(
                  "hover:text-foreground",
                  box === "closed" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                Closed
              </Link>
              {!team && (
                <span className="ms-auto text-muted-foreground">
                  Team threads: {PLANS[planFor("teamMessages")].name}
                </span>
              )}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {list.rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {q
                  ? "No conversations match."
                  : box === "unread"
                    ? "Nothing unread."
                    : box === "closed"
                      ? "No closed conversations."
                      : "No conversations yet. Emails with your contacts show up here, and New message starts one."}
              </p>
            ) : (
              <ul aria-label="Conversations">
                {list.rows.map((r) => {
                  // The open thread is being read right now.
                  if (r.id === threadId) r.unread = false;
                  const on = threadId === r.id;
                  return (
                    <li key={r.id}>
                      <Link
                        href={hrefFor({ thread: r.id, after: one(sp.after) ?? null })}
                        scroll={false}
                        className={cn(
                          "flex items-start gap-3 rounded-lg px-2.5 py-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          on ? "bg-accent" : "hover:bg-muted/60",
                        )}
                      >
                        <Avatar size="lg" aria-hidden>
                          <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
                            {r.kind === "guest" ? (
                              initialsOf(r.title)
                            ) : (
                              <UsersIcon className="size-4" />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn("truncate", r.unread ? "font-semibold" : "font-medium")}
                            >
                              {r.title}
                              {r.unread && <span className="sr-only"> (unread)</span>}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {short(r.lastActivityAt)}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="block min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {r.preview ?? (r.kind === "guest" ? "Conversation" : "Team thread")}
                            </span>
                            {r.unread && (
                              <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {list.next && (
              <Link
                href={hrefFor({ after: list.next })}
                className="block px-3 py-2 text-sm underline underline-offset-4"
              >
                Show more
              </Link>
            )}
          </div>
        </section>
        <InlinePane
          param="thread"
          id={threadId ?? null}
          label="Conversation"
          className={cn("min-h-0 min-w-0", !threadId && "hidden lg:block")}
          empty={
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-card/50 p-10">
              <EmptyState
                size="sm"
                icon={MessagesSquareIcon}
                title="Choose a conversation"
                description="Each client has one conversation, shared by your team: their emails, what they wrote when booking, and your internal notes."
              />
            </div>
          }
        >
          {threadId && (
            <ThreadPane
              v={v}
              id={threadId}
              before={one(sp.before) ?? null}
              closeHref={hrefFor({ after: one(sp.after) ?? null })}
              hrefFor={hrefFor}
              tz={tz}
              people={others}
            />
          )}
        </InlinePane>
      </div>
    </div>
  );
}

async function ThreadPane({
  v,
  id,
  before,
  closeHref,
  hrefFor,
  tz,
  people,
}: {
  v: Viewer;
  id: string;
  before: string | null;
  closeHref: string;
  hrefFor: (patch: Record<string, string | null>) => string;
  tz: string;
  people: { id: string; name: string }[];
}) {
  const d = await threadDetails(v, id);
  // Opening a thread reads it, in the same render (no second round trip).
  if (d) await markThreadRead(v, d.thread.id);
  if (!d)
    return (
      <div className="rounded-xl border bg-card p-5">
        <BackToList href={closeHref} />
        <h2 className="text-lg font-semibold tracking-tight">Conversation not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This conversation is gone, or it is a team thread you are not in.
        </p>
      </div>
    );
  const [{ items, earlier }, repliesOn, files] = await Promise.all([
    threadItems(v, d, before),
    inboundOn(v.ws),
    hasFlag(v.ws, "files"),
  ]);
  const filesOn = files && hasFeature(v.ws, "attachments");
  const team = canTeam(v.ws);
  const { thread, contact } = d;
  const title =
    thread.kind === "guest"
      ? contact?.name || contact?.email || "Conversation"
      : thread.subject || "Team thread";
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-h-0 min-w-0 flex-col rounded-xl border bg-card">
        <div className="flex items-start gap-3 border-b p-4">
          <Avatar size="lg" aria-hidden>
            <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
              {thread.kind === "guest" ? initialsOf(title) : <UsersIcon className="size-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <BackToList href={closeHref} />
            <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {thread.kind === "guest" ? (
                contact?.email
              ) : (
                <>
                  {d.participants.map((p) => p.name).join(", ")}
                  {contact && <> · about {contact.name || contact.email}</>}
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {thread.kind === "team" && (
              <AddPeopleButton
                threadId={thread.id}
                people={people.filter((p) => !d.participants.some((x) => x.userId === p.id))}
              />
            )}
            <CloseButton threadId={thread.id} closed={!!thread.closedAt} />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {earlier && (
            <Link
              href={hrefFor({ thread: thread.id, before: earlier })}
              scroll={false}
              className="text-sm underline underline-offset-4"
            >
              Show earlier
            </Link>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <ol className="space-y-3" aria-label="Messages">
              {items.map((it) => (
                <Item key={it.id} it={it} tz={tz} contactId={contact?.id ?? null} />
              ))}
            </ol>
          )}
        </div>
        <div className="border-t p-4">
          {thread.kind === "guest" && contact ? (
            <GuestComposer
              threadId={thread.id}
              contactId={contact.id}
              contactName={contact.name || contact.email}
              optedOut={contact.emailOptOut}
              repliesOn={repliesOn}
              canNote={team}
              teamPlan={PLANS[planFor("teamMessages")].name}
              people={people}
              filesOn={filesOn}
            />
          ) : (
            <TeamComposer
              threadId={thread.id}
              contactId={contact?.id ?? null}
              people={people}
              filesOn={filesOn}
            />
          )}
        </div>
      </div>
      {contact && <ClientContext v={v} contactId={contact.id} tz={tz} filesOn={filesOn} />}
    </div>
  );
}

function BackToList({ href }: { href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground lg:hidden"
    >
      <ChevronLeftIcon className="size-3.5" aria-hidden />
      All conversations
    </Link>
  );
}

/** "Client context" beside the thread (`ui mocks.png` 04): who, how to reach them, recent bookings and files. */
async function ClientContext({
  v,
  contactId,
  tz,
  filesOn,
}: {
  v: Viewer;
  contactId: string;
  tz: string;
  filesOn: boolean;
}) {
  const [c, stages, bookings, files] = await Promise.all([
    getContact(v.ws.id, contactId),
    stageChoices(v.ws),
    contactBookings(contactId, v.userId),
    filesOn ? listContactFiles(v, contactId, "all") : Promise.resolve(null),
  ]);
  if (!c) return null;
  const stage = stages.choices.find((s) => s.key === stages.keyOf(c));
  const day = (d: Date) => formatInTz(d, tz, { month: "short", day: "numeric" });
  const recent = [...bookings].reverse().slice(0, 3);
  const latest = files
    ? [...files.files]
        .sort((x, y) => +(y.readyAt ?? y.createdAt) - +(x.readyAt ?? x.createdAt))
        .slice(0, 3)
    : [];
  return (
    <aside
      aria-label="Client context"
      className="hidden min-h-0 space-y-4 overflow-y-auto rounded-xl border bg-card p-4 text-sm xl:block"
    >
      <h2 className="text-base font-semibold tracking-tight">Client context</h2>
      <div className="flex items-center gap-3">
        <Avatar size="lg" aria-hidden>
          <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
            {initialsOf(c.name || c.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <Link
            href={`/admin/contacts/${c.id}`}
            className="block truncate font-semibold hover:underline"
          >
            {c.name || c.email}
          </Link>
          {c.company && <p className="truncate text-xs text-muted-foreground">{c.company}</p>}
        </div>
      </div>
      {stage && (
        <StatusChip tone={stage.emphasis ? "success" : "neutral"} dot>
          {stage.name}
        </StatusChip>
      )}
      <ul className="space-y-1.5 text-xs">
        <li className="flex items-center gap-2">
          <MailIcon className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="truncate">{c.email}</span>
        </li>
        {c.phone && (
          <li className="flex items-center gap-2">
            <PhoneIcon className="size-3.5 text-muted-foreground" aria-hidden />
            {c.phone}
          </li>
        )}
      </ul>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Recent bookings
        </h3>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {recent.map((b) => (
              <li key={b.id} className="flex justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{day(b.startAt)}</span>
                <Link href={`/admin/bookings/${b.id}`} className="truncate hover:underline">
                  {b.eventTitle ?? "Meeting"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {files && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Recent files
            </h3>
            <Link
              href={`/admin/files?contact=${c.id}`}
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {latest.length === 0 ? (
            <p className="text-xs text-muted-foreground">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {latest.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-xs">
                  <FileTypeIcon name={f.name} className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate">
                    <FileLink file={f} className="hover:underline" />
                  </span>
                  <span className="text-muted-foreground">{day(f.readyAt ?? f.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}

function Item({ it, tz, contactId }: { it: ThreadItem; tz: string; contactId: string | null }) {
  const label =
    it.source === "note"
      ? "Internal note"
      : it.source === "booking"
        ? "When booking"
        : it.source === "email"
          ? it.automatic
            ? "Automatic email"
            : it.ours
              ? "Email sent"
              : "Email received"
          : null;
  return (
    <li
      className={cn(
        "rounded-xl border p-3 text-sm",
        it.source === "note"
          ? "border-warning/30 bg-warning-muted"
          : it.ours
            ? "ms-6 border-primary/15 bg-accent/60 sm:ms-12"
            : "me-6 bg-muted/40 sm:me-12",
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{it.author ?? "Bookly"}</span>
        {label && <span>{label}</span>}
        <span>{fmtDateTime(new Date(it.at), tz)}</span>
        {it.eventId && contactId && it.source === "email" && (
          <Link
            href={`/admin/contacts/${contactId}?entry=${it.eventId}`}
            className="underline underline-offset-4"
          >
            On the timeline
          </Link>
        )}
      </p>
      {it.subject && it.source === "email" && <p className="mt-1 font-medium">{it.subject}</p>}
      {it.body &&
        (it.automatic ? (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Show email</summary>
            <p className="mt-1 break-words whitespace-pre-line">{it.body}</p>
          </details>
        ) : (
          <p className="mt-1 break-words whitespace-pre-line">{it.body}</p>
        ))}
      <Attachments files={it.attachments} />
    </li>
  );
}

export default function MessagesPageBoundary(props: PageProps<"/admin/messages">) {
  return (
    <Suspense fallback={<BookingsSkeleton />}>
      <MessagesPage {...props} />
    </Suspense>
  );
}
