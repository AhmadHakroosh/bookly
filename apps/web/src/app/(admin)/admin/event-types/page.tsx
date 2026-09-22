import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProfileByUser, listAllEventTypes, locationLabel } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { createEventType } from "../scheduling-actions";

export const metadata = { title: "Event types" };

async function EventTypesPage({ searchParams }: PageProps<"/admin/event-types">) {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const [profile, events] = await Promise.all([
    getProfileByUser(ws.id, session.user.id),
    listAllEventTypes(ws.id),
  ]);
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Event types</h1>
          <p className="text-sm text-muted-foreground">
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
          </p>
        </div>
        <form action={createEventType}>
          <Button type="submit">New event type</Button>
        </form>
      </div>
      <ul className="space-y-2">
        {active.map((e) => (
          <li key={e.id}>
            <Link
              href={`/admin/event-types/${e.id}`}
              className="flex items-center justify-between gap-4 rounded-xl border p-4 hover:bg-muted/40"
              style={{ borderLeftColor: e.color, borderLeftWidth: 4 }}
            >
              <span>
                <span className="block font-medium">{e.title}</span>
                <span className="block text-sm text-muted-foreground">
                  /{profile?.username ?? "…"}/{e.slug} · {e.durationMin} min ·{" "}
                  {locationLabel(e.location)}
                </span>
              </span>
              <span className="flex gap-1">
                {e.hidden && <Badge variant="secondary">Hidden</Badge>}
                {e.requiresConfirmation && <Badge variant="outline">Needs confirmation</Badge>}
              </span>
            </Link>
          </li>
        ))}
        {active.length === 0 && (
          <li className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No event types yet.
          </li>
        )}
      </ul>
    </div>
  );
}

export default function EventTypesPageBoundary(props: PageProps<"/admin/event-types">) {
  return (
    <Suspense fallback={null}>
      <EventTypesPage {...props} />
    </Suspense>
  );
}
