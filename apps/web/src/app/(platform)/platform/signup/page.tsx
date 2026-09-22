import type { Metadata } from "next";
import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { getSession } from "@/server/session";
import { pageMetadata, SITE } from "../site";
import { SignupForm } from "./signup-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata: Metadata = pageMetadata({
  title: "Get started",
  description:
    "Create your Bookly workspace in two minutes: a booking page on your own subdomain, calendar sync, built-in video and the Meeting Inbox. Free plan, no card.",
  path: "/signup",
});

async function SignupPage() {
  const session = await getSession();
  return (
    <div className="mx-auto max-w-md px-4 py-14 md:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Create your booking page</h1>
      <p className="mt-1 text-sm text-muted-foreground">Free to start. No card needed.</p>
      <div className="mt-8">
        <SignupForm
          rootDomain={loadEnv().ROOT_DOMAIN ?? ""}
          signedIn={!!session}
          legalVersion={SITE.legalUpdated}
        />
      </div>
    </div>
  );
}

export default function SignupPageBoundary() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SignupPage />
    </Suspense>
  );
}
