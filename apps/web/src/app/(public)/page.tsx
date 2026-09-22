import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listProfiles } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";
import { PageSkeleton } from "@/components/page-skeleton";

async function HomePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();
  const profiles = await listProfiles(workspace.id);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{workspace.name}</h1>
      {workspace.description && (
        <p className="mt-2 text-muted-foreground">{workspace.description}</p>
      )}
      <ul className="mt-10 space-y-3">
        {profiles.map((p) => (
          <li key={p.id}>
            <Link
              href={`/${p.username}`}
              className="flex items-center gap-4 rounded-xl border p-4 hover:bg-muted/40"
            >
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                  {p.displayName.slice(0, 1)}
                </span>
              )}
              <span>
                <span className="block font-medium">{p.displayName}</span>
                {p.bio && <span className="block text-sm text-muted-foreground">{p.bio}</span>}
              </span>
            </Link>
          </li>
        ))}
        {profiles.length === 0 && (
          <li className="text-sm text-muted-foreground">No booking pages yet.</li>
        )}
      </ul>
    </div>
  );
}

export default function HomePageBoundary() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomePage />
    </Suspense>
  );
}
