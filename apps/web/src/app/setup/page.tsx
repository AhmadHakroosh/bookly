import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/server/session";
import { needsSetup } from "@/server/workspace";
import { SetupForm } from "./setup-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Set up Bookly", robots: { index: false } };

async function SetupPage() {
  if (!(await needsSetup())) redirect("/admin");
  const session = await getSession();
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Bookly</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {session
            ? `Create a new workspace. You (${session.user.email}) will be its owner.`
            : "Create your scheduling workspace and the owner account. Takes about a minute."}
        </p>
        <div className="mt-8">
          <SetupForm signedIn={!!session} />
          {!session && (
            <p className="mt-6 text-sm text-muted-foreground">
              Already have an account here?{" "}
              <Link href="/login?next=/setup" className="underline underline-offset-4">
                Sign in
              </Link>{" "}
              and you will own the new workspace.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/** Suspense boundary for Cache Components: the page reads request data and streams in. */
export default function SetupPageBoundary() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SetupPage />
    </Suspense>
  );
}
