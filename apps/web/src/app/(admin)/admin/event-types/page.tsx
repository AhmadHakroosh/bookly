import { EventTypesSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarPlusIcon, MessageSquareIcon, PlusIcon, RepeatIcon, UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { formatPrice } from "@/server/payments";
import { SubmitButton } from "@/components/submit-button";
import { getProfileByUser, listAllEventTypes, locationLabel } from "@/server/scheduling";
import { isManager, requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { createEventType } from "../scheduling-actions";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Event types" };

async function EventTypesPage({ searchParams }: PageProps<"/admin/event-types">) {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const [profile, all] = await Promise.all([
    getProfileByUser(ws.id, session.user.id),
    listAllEventTypes(ws.id),
  ]);
  // Owners and admins manage every host's event types; a member manages their own.
  const events = isManager(role) ? all : all.filter((e) => e.userId === session.user.id);
  const active = events.filter((e) => e.active);
  const sp = await searchParams;
  const limit = typeof sp.limit === "string" ? sp.limit : null;
  return (
    <div className="space-y-6">
      {limit && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          {limit}{" "}
          <Link href="/admin/billing" className="underline underline-offset-4">
            See plans
          </Link>
        </p>
      )}
      <PageHeader
        title="Event types"
        description={
          <>
            Create and manage the types of meetings you offer.{" "}
            {profile ? (
              <>
                Your page:{" "}
                <Link
                  href={`/${profile.username}`}
                  className="underline underline-offset-4"
                  target="_blank"
                >
                  /{profile.username}
                </Link>
              </>
            ) : (
              <>
                <Link href="/admin/profile?setup=1" className="underline underline-offset-4">
                  Set up your booking page
                </Link>{" "}
                first.
              </>
            )}
          </>
        }
        actions={
          <form action={createEventType}>
            <SubmitButton>
              <PlusIcon data-icon="inline-start" />
              Create event type
            </SubmitButton>
          </form>
        }
      />
      <ul className="grid gap-3 md:grid-cols-2">
        {active.map((e) => {
          const series = !!e.recurrence.enabled;
          const group = e.seats > 1;
          const Icon = series ? RepeatIcon : group ? UsersIcon : MessageSquareIcon;
          const kind = series ? "Recurring" : group ? "Group" : "Individual";
          return (
            <li key={e.id}>
              <Link
                href={`/admin/event-types/${e.id}`}
                className="flex items-center gap-4 rounded-xl border bg-card p-4 outline-none hover:border-primary/40 hover:bg-[color-mix(in_oklch,var(--accent)_35%,var(--card))] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: `color-mix(in oklch, ${e.color} 14%, var(--card))`,
                    color: e.color,
                  }}
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {series && e.recurrence.count
                      ? `${e.recurrence.count} sessions`
                      : `${e.durationMin} min`}
                    <span aria-hidden> • </span>
                    {e.priceCents ? `${formatPrice(e.priceCents, e.currency ?? "usd")}` : "Free"}
                    <span aria-hidden> • </span>
                    {locationLabel(e.location)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    /{profile?.username ?? "…"}/{e.slug}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusChip tone={series ? "success" : group ? "accent" : "info"}>
                    {kind}
                  </StatusChip>
                  {e.hidden && <StatusChip tone="neutral">Hidden</StatusChip>}
                  {e.requiresConfirmation && (
                    <StatusChip tone="warning">Needs confirmation</StatusChip>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
        {active.length === 0 && (
          <li className="md:col-span-2">
            <EmptyState
              icon={CalendarPlusIcon}
              title="No event types yet."
              description="An event type is something people can book: a free 30-minute intro call, a paid strategy session, a group workshop."
            />
          </li>
        )}
      </ul>
    </div>
  );
}

export default function EventTypesPageBoundary(props: PageProps<"/admin/event-types">) {
  return (
    <Suspense fallback={<EventTypesSkeleton />}>
      <EventTypesPage {...props} />
    </Suspense>
  );
}
