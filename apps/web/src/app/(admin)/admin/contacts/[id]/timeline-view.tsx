"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  BanknoteIcon,
  CalendarCheckIcon,
  FileIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarXIcon,
  CheckCircleIcon,
  CircleIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  HourglassIcon,
  MailIcon,
  NotebookPenIcon,
  PaperclipIcon,
  PencilLineIcon,
  ReplyIcon,
  SquareCheckIcon,
  UserXIcon,
  type LucideIcon,
} from "lucide-react";
import { AttachFiles } from "@/components/drive/attach-files";
import { FileLink } from "@/components/drive/file-viewer";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FileRef, TimelineDay, TimelineItem } from "@/server/timeline";
import { loadTimelineAction, replyFromTimelineAction, type ReplyState } from "./timeline-actions";

const ICON: Record<string, LucideIcon> = {
  booked: CalendarIcon,
  confirmed: CalendarCheckIcon,
  cancelled: CalendarXIcon,
  rescheduled: CalendarClockIcon,
  completed: CheckCircleIcon,
  no_show: UserXIcon,
  email_sent: MailIcon,
  email_received: ReplyIcon,
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

const isEmail = (t: string) => t === "email_sent" || t === "email_received";

const NOT_KEPT: Record<string, string> = {
  plan: "files come with Pro",
  "too large": "too large to keep",
  "storage full": "storage is full",
  deleted: "deleted since",
};

/** An email's attachments: kept ones open in the viewer (or download), the rest say why not. */
export function Attachments({ files }: { files: FileRef[] }) {
  if (!files.length) return null;
  return (
    <ul
      className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground"
      aria-label="Attachments"
    >
      {files.map((f, i) => (
        <li key={i} className="inline-flex items-center gap-1">
          <PaperclipIcon className="size-3" aria-hidden />
          {f.fileId ? (
            <FileLink
              file={{ id: f.fileId, name: f.filename, mime: f.mime }}
              className="text-foreground underline underline-offset-4"
            />
          ) : (
            <span>
              {f.filename}
              {f.reason ? ` (${NOT_KEPT[f.reason] ?? "not kept"})` : ""}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ReplyForm({
  contactId,
  parentId,
  onDone,
  filesOn,
}: {
  contactId: string;
  parentId: string;
  onDone: () => void;
  filesOn: boolean;
}) {
  const [state, action] = useActionState(async (prev: ReplyState, fd: FormData) => {
    const r = await replyFromTimelineAction(contactId, parentId, prev, fd);
    if (r.ok) onDone();
    return r;
  }, {} as ReplyState);
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok) toast.success("Reply sent");
  }, [state]);
  return (
    <form action={action} className="mt-2 space-y-2">
      <Textarea name="body" rows={4} required maxLength={8000} aria-label="Your reply" autoFocus />
      {filesOn && <AttachFiles contactId={contactId} />}
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingText="Sending…">
          Send reply
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Email({ item }: { item: TimelineItem }) {
  if (!item.body) return null;
  return (
    <details className="group mt-1 rounded-lg border bg-muted/20 text-sm open:bg-background">
      <summary className="cursor-pointer list-none px-3 py-1.5 text-xs text-muted-foreground select-none hover:text-foreground">
        <span className="group-open:hidden">Show email</span>
        <span className="hidden group-open:inline">Hide email</span>
        {item.subject && <span className="ml-2 text-foreground">· {item.subject}</span>}
      </summary>
      <div className="border-t px-3 py-2 break-words whitespace-pre-line">{item.body}</div>
    </details>
  );
}

function Entry({
  item,
  contactId,
  entryHref,
  canReply,
  filesOn,
}: {
  item: TimelineItem;
  contactId: string;
  entryHref: (id: string) => string;
  canReply: boolean;
  filesOn: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const Icon = ICON[item.type] ?? CircleIcon;
  return (
    <li className="flex gap-3 text-sm">
      <span className="mt-0.5 w-5 shrink-0 text-muted-foreground" aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={entryHref(item.id)}
            scroll={false}
            className="min-w-0 whitespace-pre-line hover:underline"
          >
            {item.summary}
          </Link>
          <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {item.time}
          </time>
        </div>
        {item.meeting && item.bookingId && (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
            <Link
              href={`/admin/bookings/${item.bookingId}`}
              className="underline underline-offset-4"
            >
              {item.meeting.title}
            </Link>
            {item.meeting.recap && (
              <Link
                href={`/admin/bookings/${item.bookingId}#recap`}
                className="underline underline-offset-4"
              >
                Recap
              </Link>
            )}
            {item.meeting.transcript && (
              <Link
                href={`/admin/bookings/${item.bookingId}#transcript`}
                className="underline underline-offset-4"
              >
                Transcript
              </Link>
            )}
          </p>
        )}
        {item.answers && (
          <dl className="mt-1 text-xs text-muted-foreground">
            {Object.entries(item.answers).map(([k, v]) => (
              <div key={k}>
                <dt className="inline font-medium">{k}: </dt>
                <dd className="inline">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        {item.file && (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
            <FileLink
              file={{ id: item.file.id, name: item.file.name, mime: item.file.mime }}
              className="underline underline-offset-4"
            >
              Open file
            </FileLink>
            {item.file.taskId && (
              <Link
                href={`/admin/tasks?task=${item.file.taskId}`}
                className="underline underline-offset-4"
              >
                Open task
              </Link>
            )}
          </p>
        )}
        {isEmail(item.type) && <Email item={item} />}
        {item.type === "note" && item.body && (
          <p className="mt-1 rounded-lg border bg-muted/20 px-3 py-2 text-sm break-words whitespace-pre-line">
            {item.body}
          </p>
        )}
        <Attachments files={item.attachments} />
        {item.replies.length > 0 && (
          <ol className="mt-2 space-y-2 border-l-2 pl-3" aria-label="Replies">
            {item.replies.map((r) => (
              <li key={r.id} className="text-sm">
                <p className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <Link href={entryHref(r.id)} scroll={false} className="hover:underline">
                    <span className="font-medium text-foreground">
                      {r.type === "email_received" ? (r.from ?? "They") : "You"}
                    </span>{" "}
                    {r.type === "email_received" ? "replied" : "answered"}
                  </Link>
                  <time dateTime={r.at} className="tabular-nums">
                    {r.time}
                  </time>
                </p>
                {r.body && (
                  <p className="mt-0.5 line-clamp-6 break-words whitespace-pre-line">{r.body}</p>
                )}
                <Attachments files={r.attachments} />
              </li>
            ))}
          </ol>
        )}
        {canReply && isEmail(item.type) && !replying && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 -ml-2 text-muted-foreground"
            onClick={() => setReplying(true)}
          >
            <ReplyIcon data-icon="inline-start" />
            Reply
          </Button>
        )}
        {replying && (
          <ReplyForm
            filesOn={filesOn}
            contactId={contactId}
            parentId={item.replies[item.replies.length - 1]?.id ?? item.id}
            onDone={() => setReplying(false)}
          />
        )}
      </div>
    </li>
  );
}

/**
 * The contact's timeline: days newest first, each under a date divider. The first window comes
 * from the server; "Show earlier" fetches the next one, and from then on the next window loads
 * by itself as the bottom of the list comes into view.
 */
export function TimelineView({
  contactId,
  initial,
  canReply,
  filesOn = false,
}: {
  contactId: string;
  initial: { days: TimelineDay[]; next: string | null };
  canReply: boolean;
  /** Files are on: replies can carry files from the drive. */
  filesOn?: boolean;
}) {
  const [days, setDays] = useState(initial.days);
  const [next, setNext] = useState(initial.next);
  const [auto, setAuto] = useState(false);
  const [loading, start] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const entryHref = (id: string) => `/admin/contacts/${contactId}?entry=${id}`;

  const loadEarlier = () =>
    start(async () => {
      if (!next) return;
      const page = await loadTimelineAction(contactId, next);
      if (!page) return;
      setDays((prev) => {
        const merged = [...prev];
        for (const d of page.days) {
          const tail = merged[merged.length - 1];
          if (tail && tail.day === d.day)
            merged[merged.length - 1] = { ...tail, items: [...tail.items, ...d.items] };
          else merged.push(d);
        }
        return merged;
      });
      setNext(page.next);
    });

  useEffect(() => {
    const el = sentinel.current;
    if (!auto || !el || !next) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loading) loadEarlier();
    });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadEarlier is recreated each render
  }, [auto, next, loading]);

  if (!days.length) return <p className="mt-3 text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <div className="mt-4 space-y-6" aria-busy={loading}>
      {days.map((d) => (
        <section key={d.day} aria-labelledby={`day-${d.day}`}>
          <h3
            id={`day-${d.day}`}
            className="mb-3 flex items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            {d.label}
            <span className="h-px flex-1 bg-border" aria-hidden />
          </h3>
          <ol className="space-y-4">
            {d.items.map((it) => (
              <Entry
                key={it.id}
                item={it}
                contactId={contactId}
                entryHref={entryHref}
                canReply={canReply}
                filesOn={filesOn}
              />
            ))}
          </ol>
        </section>
      ))}
      <div ref={sentinel} className={cn(!next && "hidden")}>
        <Button
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => {
            setAuto(true);
            loadEarlier();
          }}
        >
          {loading ? "Loading…" : "Show earlier"}
        </Button>
      </div>
    </div>
  );
}
