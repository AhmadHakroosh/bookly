import { redirect } from "next/navigation";
import { Suspense } from "react";
import { needsSetup } from "@/server/workspace";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Set up Bookly", robots: { index: false } };

async function SetupPage() {
  if (!(await needsSetup())) redirect("/admin");
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Bookly</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your scheduling workspace and the owner account. Takes about a minute.
        </p>
        <div className="mt-8">
          <SetupForm />
        </div>
      </div>
    </main>
  );
}

/** Suspense boundary for Cache Components: the page reads request data and streams in. */
export default function SetupPageBoundary() {
  return (
    <Suspense fallback={null}>
      <SetupPage />
    </Suspense>
  );
}
