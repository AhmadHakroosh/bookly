import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
  AlertCircleIcon,
  BellIcon,
  CalendarIcon,
  CheckSquareIcon,
  CreditCardIcon,
  InboxIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, fmtDateTime, fmtTime, todayIn, utcToZoned } from "@/lib/time";
import {
  contactsSummary,
  needsAttention,
  newSinceLastVisit,
  paymentsThisMonth,
  tasksSummary,
  upcomingThisWeek,
  type HomeScope,
} from "@/server/home";
import { listNotifications, unreadCount } from "@/server/notifications";
import { formatPrice, paymentsReady } from "@/server/payments";

/*
 * The Home dashboard: one card per area, each a link to the page that owns it. Every card is
 * its own Suspense boundary with a skeleton of its final size, so a slow query never holds the
 * others up and the grid does not jump when they arrive.
 */

function CardShell({
  href,
  title,
  icon: Icon,
  children,
}: {
  href: string;
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-28 flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-36 sm:gap-3"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground">
        <Icon className="size-4" aria-hidden />
        {title}
      </span>
      <div className="flex-1 text-sm">{children}</div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div
      className="flex min-h-28 flex-col gap-2 rounded-xl border p-4 sm:min-h-36 sm:gap-3"
      aria-hidden
    >
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

const Big = ({ children }: { children: ReactNode }) => (
  <p className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">{children}</p>
);
const Sub = ({ children }: { children: ReactNode }) => (
  <p className="text-muted-foreground">{children}</p>
);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function UpcomingCard({ scope }: { scope: HomeScope }) {
  const { total, next } = await upcomingThisWeek(scope);
  const today = todayIn(scope.tz);
  return (
    <CardShell href="/admin/bookings" title="This week" icon={CalendarIcon}>
      <Big>{total}</Big>
      {total === 0 ? (
        <Sub>No more meetings this week.</Sub>
      ) : (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {next.map((b) => (
            <li key={b.id} className="truncate">
              {utcToZoned(b.startAt, scope.tz).date === today
                ? `Today ${fmtTime(b.startAt, scope.tz)}`
                : fmtDateTime(b.startAt, scope.tz)}{" "}
              · {b.attendeeName}
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

async function NewBookingsCard({ scope, since }: { scope: HomeScope; since: Date | null }) {
  const r = await newSinceLastVisit(scope, since);
  return (
    <CardShell href="/admin/bookings" title="Since your last visit" icon={BellIcon}>
      {!r.since ? (
        <Sub>New bookings and cancellations will show here from your next visit.</Sub>
      ) : (
        <>
          <Big>{r.total}</Big>
          <Sub>
            {r.total === 0 ? "No new bookings" : plural(r.total, "new booking")}
            {r.cancelled > 0 ? ` · ${plural(r.cancelled, "cancellation")}` : ""} since{" "}
            {fmtDate(r.since, scope.tz)}
          </Sub>
        </>
      )}
    </CardShell>
  );
}

async function PaymentsCard({ scope }: { scope: HomeScope }) {
  if (!paymentsReady(scope.ws))
    return (
      <CardShell href="/admin/settings/payments" title="Payments this month" icon={CreditCardIcon}>
        <Sub>Connect Stripe to take paid bookings and see payments here.</Sub>
      </CardShell>
    );
  const totals = await paymentsThisMonth(scope);
  return (
    <CardShell href="/admin/bookings?view=past" title="Payments this month" icon={CreditCardIcon}>
      {totals.length === 0 ? (
        <>
          <Big>{formatPrice(0, "usd")}</Big>
          <Sub>No payments yet this month.</Sub>
        </>
      ) : (
        <>
          <Big>{formatPrice(totals[0]!.cents, totals[0]!.currency)}</Big>
          <Sub>
            {plural(
              totals.reduce((n, t) => n + t.count, 0),
              "paid booking",
            )}
            {totals.length > 1
              ? ` · also ${totals
                  .slice(1)
                  .map((t) => formatPrice(t.cents, t.currency))
                  .join(", ")}`
              : ""}
          </Sub>
        </>
      )}
    </CardShell>
  );
}

async function ContactsCard({ scope }: { scope: HomeScope }) {
  const c = await contactsSummary(scope);
  return (
    <CardShell href="/admin/contacts" title="Contacts" icon={UsersIcon}>
      <Big>{c.addedThisWeek}</Big>
      <Sub>
        new this week ·{" "}
        {c.followUpsDue === 0 ? "no follow-ups due" : `${plural(c.followUpsDue, "follow-up")} due`}
      </Sub>
    </CardShell>
  );
}

async function AttentionCard({ scope }: { scope: HomeScope }) {
  const a = await needsAttention(scope);
  const total = a.requests + a.recaps + a.followUps;
  const href = a.requests ? "#requests" : a.recaps ? "#recaps" : "#follow-up";
  return (
    <CardShell href={`/admin${href}`} title="Needs attention" icon={AlertCircleIcon}>
      <Big>{total}</Big>
      {total === 0 ? (
        <Sub>Nothing is waiting on you.</Sub>
      ) : (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {a.requests > 0 && <li>{plural(a.requests, "request")} to accept</li>}
          {a.recaps > 0 && <li>{plural(a.recaps, "recap")} to review</li>}
          {a.followUps > 0 && <li>{plural(a.followUps, "person", "people")} to follow up</li>}
        </ul>
      )}
    </CardShell>
  );
}

async function TasksCard({
  scope,
  userId,
  manager,
  board,
}: {
  scope: HomeScope;
  userId: string;
  manager: boolean;
  /** The task board is on: the card opens its "My tasks" view. */
  board: boolean;
}) {
  const t = await tasksSummary(scope, userId, manager);
  return (
    <CardShell
      href={board ? "/admin/tasks?view=mine" : "/admin#tasks"}
      title="Your tasks"
      icon={CheckSquareIcon}
    >
      <Big>{t.open}</Big>
      {t.open === 0 ? (
        <Sub>No open tasks.</Sub>
      ) : (
        <Sub>
          open · {t.overdue > 0 ? `${t.overdue} overdue` : "none overdue"}
          {t.dueToday > 0 ? ` · ${t.dueToday} due today` : ""}
        </Sub>
      )}
      {t.team !== null && t.team > t.open && (
        <p className="mt-1 text-xs text-muted-foreground">
          {plural(t.team, "open task")} across the team
        </p>
      )}
    </CardShell>
  );
}

async function NotificationsCard({ scope, userId }: { scope: HomeScope; userId: string }) {
  const [unread, { rows }] = await Promise.all([
    unreadCount(scope.ws.id, userId),
    listNotifications(scope.ws.id, userId, { limit: 3 }),
  ]);
  return (
    <CardShell href="/admin/notifications" title="Notifications" icon={InboxIcon}>
      <Big>{unread}</Big>
      {rows.length === 0 ? (
        <Sub>Nothing yet. The bell in the header lists what happens as it happens.</Sub>
      ) : (
        <>
          <Sub>{unread === 0 ? "All read" : plural(unread, "unread")}</Sub>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {rows.map((n) => (
              <li key={n.id} className={n.readAt ? "truncate" : "truncate text-foreground"}>
                {n.title}
              </li>
            ))}
          </ul>
        </>
      )}
    </CardShell>
  );
}

const Slot = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<CardSkeleton />}>{children}</Suspense>
);

export function HomeCards({
  scope,
  userId,
  manager,
  since,
  notifications = false,
  taskBoard = false,
}: {
  scope: HomeScope;
  userId: string;
  manager: boolean;
  since: Date | null;
  /** The notifications card, once that flag is on for the workspace. */
  notifications?: boolean;
  /** The task board is on: the tasks card links to it. */
  taskBoard?: boolean;
}) {
  return (
    <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Slot>
        <UpcomingCard scope={scope} />
      </Slot>
      <Slot>
        <NewBookingsCard scope={scope} since={since} />
      </Slot>
      <Slot>
        <AttentionCard scope={scope} />
      </Slot>
      <Slot>
        <TasksCard scope={scope} userId={userId} manager={manager} board={taskBoard} />
      </Slot>
      {notifications && (
        <Slot>
          <NotificationsCard scope={scope} userId={userId} />
        </Slot>
      )}
      <Slot>
        <ContactsCard scope={scope} />
      </Slot>
      {manager && (
        <Slot>
          <PaymentsCard scope={scope} />
        </Slot>
      )}
    </section>
  );
}
