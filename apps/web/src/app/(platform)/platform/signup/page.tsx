import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { getSession } from "@/server/session";
import { SITE } from "../site";
import { SignupForm } from "./signup-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Get started" };

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
