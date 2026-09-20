import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentWorkspace } from "@/server/workspace";

async function HomePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{workspace.name}</h1>
      {workspace.description && (
        <p className="mt-2 text-muted-foreground">{workspace.description}</p>
      )}
      <p className="mt-8 text-sm text-muted-foreground">Booking pages open in the next phase.</p>
      <Link
        href="/admin"
        className="mt-4 text-xs text-muted-foreground underline underline-offset-4"
      >
        Admin
      </Link>
    </main>
  );
}

export default function HomePageBoundary() {
  return (
    <Suspense fallback={null}>
      <HomePage />
    </Suspense>
  );
}
