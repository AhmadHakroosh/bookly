import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PLANS, planFor } from "@bookly/cloud";
import {
  CheckCheckIcon,
  InboxIcon,
  MailIcon,
  SearchIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import { BetaBadge } from "@/components/beta-badge";
import { PaneHost } from "@/components/pane";
import { BookingsSkeleton } from "@/components/skeletons/pages";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/time";
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
import { LiveRefresh, ThreadSheet } from "./thread-sheet";
import { AddPeopleButton, CloseButton } from "./thread-controls";
import { PageHeader } from "@/components/ui/page-header";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const BOX_LABELS: Record<ThreadBox, [string, typeof InboxIcon]> = {
  inbox: ["Inbox", InboxIcon],
  unread: ["Unread", MailIcon],
  guests: ["Clients", UserRoundIcon],
  team: ["Team", UsersIcon],
  closed: ["Closed", CheckCheckIcon],
};

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
  // The open thread counts as read (it is marked so while the pane renders).
  const shownUnread = Math.max(
    0,
    unread - (list.rows.some((r) => r.id === threadId && r.unread) ? 1 : 0),
  );
  const others = people
    .filter((p) => p.userId !== session.user.id)
    .map((p) => ({ id: p.userId, name: p.displayName }));

  return (
    <div className="space-y-6">
      <LiveRefresh rendered={latest} />
      <PageHeader
        title="Messages"
        badge={beta && <BetaBadge />}
        description={<>{shownUnread ? `${shownUnread} unread` : "All caught up"}</>}
        actions={
          <>
            <form
              method="get"
              action="/admin/messages"
              className="relative w-full sm:w-64"
              role="search"
            >
              <SearchIcon
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              {box !== "inbox" && <input type="hidden" name="box" value={box} />}
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search messages"
                aria-label="Search messages"
                className="pl-9"
              />
            </form>
            <NewMessageButton
              canGuest={guest}
              canTeam={team}
              teamPlan={PLANS[planFor("teamMessages")].name}
              people={others}
            />
          </>
        }
      />
      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <nav aria-label="Mailboxes" className="flex gap-1 overflow-x-auto md:flex-col">
          {BOXES.filter((b) => (b !== "team" || team) && (b !== "guests" || guest)).map((b) => {
            const [label, Icon] = BOX_LABELS[b];
            return (
              <Link
                key={b}
                href={b === "inbox" ? "/admin/messages" : `/admin/messages?box=${b}`}
                aria-current={box === b ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap",
                  box === b
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {b === "unread" && shownUnread > 0 && (
                  <span className="ml-auto text-xs tabular-nums">{shownUnread}</span>
                )}
              </Link>
            );
          })}
          {!team && (
            <p className="hidden px-2 pt-2 text-xs text-muted-foreground md:block">
              Team threads and internal notes come with {PLANS[planFor("teamMessages")].name}.
            </p>
          )}
        </nav>
        <section aria-label="Conversations" className="min-w-0 space-y-4">
          {list.rows.length === 0 ? (
            <p className="rounded-xl border p-6 text-sm text-muted-foreground">
              {q
                ? "No conversations match."
                : box === "unread"
                  ? "Nothing unread."
                  : box === "closed"
                    ? "No closed conversations."
                    : "No conversations yet. Emails with your contacts show up here, and New message starts one."}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border" aria-label="Conversations">
              {list.rows.map((r) => {
                const Icon = r.kind === "guest" ? UserRoundIcon : UsersIcon;
                // The open thread is being read right now.
                if (r.id === threadId) r.unread = false;
                return (
                  <li key={r.id}>
                    <Link
                      href={hrefFor({ thread: r.id, after: one(sp.after) ?? null })}
                      scroll={false}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/40",
                        threadId === r.id && "bg-muted/60",
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn("block truncate", r.unread ? "font-semibold" : undefined)}
                        >
                          {r.title}
                          {r.unread && <span className="sr-only"> (unread)</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.preview ?? (r.kind === "guest" ? "Conversation" : "Team thread")}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fmtDateTime(r.lastActivityAt, tz)}
                        </span>
                        {r.unread && (
                          <span className="size-2 rounded-full bg-primary" aria-hidden />
                        )}
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
              className="text-sm underline underline-offset-4"
            >
              Show more
            </Link>
          )}
        </section>
      </div>
      <PaneHost
        param="thread"
        id={threadId ?? null}
        label="Conversation"
        className="data-[side=right]:sm:max-w-2xl"
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
      </PaneHost>
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
      <ThreadSheet title="Conversation not found" closeHref={closeHref} threadId={null}>
        <p className="text-sm text-muted-foreground">
          This conversation is gone, or it is a team thread you are not in.
        </p>
      </ThreadSheet>
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
    <ThreadSheet title={title} closeHref={closeHref} threadId={thread.id}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight break-words">{title}</h1>
            <p className="text-xs text-muted-foreground">
              {thread.kind === "guest" ? (
                <>
                  {contact?.email} ·{" "}
                  <Link
                    href={`/admin/contacts/${contact?.id}`}
                    className="underline underline-offset-4"
                  >
                    Contact
                  </Link>
                </>
              ) : (
                <>
                  {d.participants.map((p) => p.name).join(", ")}
                  {contact && (
                    <>
                      {" · about "}
                      <Link
                        href={`/admin/contacts/${contact.id}`}
                        className="underline underline-offset-4"
                      >
                        {contact.name || contact.email}
                      </Link>
                    </>
                  )}
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
    </ThreadSheet>
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
        it.source === "note" && "border-warning/30 bg-warning-muted",
        it.ours && it.source !== "note" && "bg-muted/40",
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
