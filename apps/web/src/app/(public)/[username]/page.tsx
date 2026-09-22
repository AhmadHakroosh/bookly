import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatPrice, paymentsReady } from "@/server/payments";
import {
  eventLocations,
  getProfileByUsername,
  listEventTypes,
  locationsLabel,
} from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";
import { PageSkeleton } from "@/components/page-skeleton";

export async function generateMetadata({ params }: PageProps<"/[username]">): Promise<Metadata> {
  const { username } = await params;
  const ws = await getCurrentWorkspace();
  const p = ws ? await getProfileByUsername(ws.id, username) : null;
  return p ? { title: `Book ${p.displayName}`, description: p.bio ?? undefined } : {};
}

async function ProfilePage({ params }: PageProps<"/[username]">) {
  const { username } = await params;
  const ws = await getCurrentWorkspace();
  const profile = ws ? await getProfileByUsername(ws.id, username) : null;
  if (!ws || !profile) notFound();
  const events = await listEventTypes(ws.id, profile.userId);
  const paid = paymentsReady(ws);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <header className="flex items-center gap-4">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full bg-muted text-2xl font-semibold">
            {profile.displayName.slice(0, 1)}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{profile.displayName}</h1>
          {profile.bio && <p className="mt-1 text-sm text-muted-foreground">{profile.bio}</p>}
        </div>
      </header>
      <ul className="mt-10 space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <Link
              href={`/${profile.username}/${e.slug}`}
              className="block rounded-xl border p-4 hover:bg-muted/40"
              style={{ borderLeftColor: e.color, borderLeftWidth: 4 }}
            >
              <span className="block font-medium">{e.title}</span>
              <span className="block text-sm text-muted-foreground">
                {e.durationMin} min · {locationsLabel(eventLocations(e))}
                {e.priceCents && paid ? ` · ${formatPrice(e.priceCents, e.currency)}` : ""}
              </span>
              {e.description && (
                <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                  {e.description}
                </span>
              )}
            </Link>
          </li>
        ))}
        {events.length === 0 && (
          <li className="text-sm text-muted-foreground">Nothing to book yet.</li>
        )}
      </ul>
    </div>
  );
}

export default function ProfilePageBoundary(props: PageProps<"/[username]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfilePage {...props} />
    </Suspense>
  );
}
