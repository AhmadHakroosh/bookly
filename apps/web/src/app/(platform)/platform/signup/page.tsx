import type { Metadata } from "next";
import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { configuredSocialProviders, socialErrorMessage } from "@/lib/social-providers";
import { getSession } from "@/server/session";
import { pageMetadata, SITE } from "../site";
import { SignupForm } from "./signup-form";
import { FormSkeleton } from "@/components/form-skeleton";

export const metadata: Metadata = pageMetadata({
  title: "Get started",
  description:
    "Create your Bookly workspace in two minutes: a booking page on your own subdomain, calendar sync, Bookly video and the Meeting Inbox. Free plan, no card.",
  path: "/signup",
});

async function SignupPage({ searchParams }: PageProps<"/platform/signup">) {
  const [session, { error, provider }] = await Promise.all([getSession(), searchParams]);
  const env = loadEnv();
  // A failed round trip through a provider lands back here with ?error=<code>&provider=<id>.
  const socialError =
    typeof error === "string" && typeof provider === "string"
      ? socialErrorMessage(error, provider, true)
      : null;
  return (
    <div className="mx-auto max-w-md px-4 py-14 md:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Create your booking page</h1>
      <p className="mt-1 text-sm text-muted-foreground">Free to start. No card needed.</p>
      {socialError && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 p-3 text-sm">
          {socialError}
        </p>
      )}
      <div className="mt-8">
        <SignupForm
          rootDomain={env.ROOT_DOMAIN ?? ""}
          signedIn={!!session}
          legalVersion={SITE.legalUpdated}
          providers={configuredSocialProviders(env)}
        />
      </div>
    </div>
  );
}

export default function SignupPageBoundary(props: PageProps<"/platform/signup">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-14 md:py-20">
          <FormSkeleton fields={4} />
        </div>
      }
    >
      <SignupPage {...props} />
    </Suspense>
  );
}
