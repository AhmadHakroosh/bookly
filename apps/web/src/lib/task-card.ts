import { fmtDate } from "@/lib/time";

/** What a board card or list row shows; built on the server and for "Show more" pages alike. */
export type CardTask = {
  id: string;
  title: string;
  due: string | null;
  overdue: boolean;
  contact: string | null;
  booking: string | null;
  assignee: string | null;
  comments: number;
  done: boolean;
};

type Source = {
  id: string;
  title: string;
  dueAt: Date | string | null;
  doneAt: Date | string | null;
  userId: string;
  contactName: string | null;
  bookingTitle: string | null;
  comments: number;
};

export function cardOf(
  t: Source,
  tz: string,
  people: Record<string, string>,
  now = Date.now(),
): CardTask {
  const due = t.dueAt ? new Date(t.dueAt) : null;
  return {
    id: t.id,
    title: t.title,
    due: due ? fmtDate(due, tz) : null,
    overdue: !!due && !t.doneAt && due.getTime() < now,
    contact: t.contactName,
    booking: t.bookingTitle,
    assignee: people[t.userId] ?? null,
    comments: t.comments,
    done: !!t.doneAt,
  };
}
