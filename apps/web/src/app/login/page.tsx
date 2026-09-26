import { redirect } from "next/navigation";
import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { configuredSocialProviders, socialErrorMessage } from "@/lib/social-providers";
import { isCloud, onPlatformHost } from "@/server/platform";
import { getSession } from "@/server/session";
import { LoginForm } from "./login-form";
import { FormSkeleton } from "@/components/form-skeleton";

export const metadata = { title: "Sign in", robots: { index: false } };

async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, deleted, error, provider } = await searchParams;
  const fallback = (await onPlatformHost()) ? "/workspaces" : "/admin";
  const target = typeof next === "string" && next.startsWith("/") ? next : fallback;
  if (await getSession()) redirect(target);
  const providers = configuredSocialProviders(loadEnv());
  // A failed round trip through a provider lands back here with ?error=<code>&provider=<id>.
  const socialError =
    typeof error === "string" && typeof provider === "string"
      ? socialErrorMessage(error, provider, isCloud())
      : null;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        {deleted === "1" && (
          <p className="mt-3 rounded-md border p-3 text-sm text-muted-foreground">
            Your account has been deleted. Thanks for using Bookly.
          </p>
        )}
        {socialError && (
          <p role="alert" className="mt-3 rounded-md border border-destructive/40 p-3 text-sm">
            {socialError}
          </p>
        )}
        <div className="mt-8">
          <LoginForm next={target} providers={providers} />
        </div>
      </div>
    </main>
  );
}

/** Suspense boundary for Cache Components: the page reads request data and streams in. */
export default function LoginPageBoundary(props: PageProps<"/login">) {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="w-full max-w-sm">
            <FormSkeleton fields={2} tabs />
          </div>
        </main>
      }
    >
      <LoginPage {...props} />
    </Suspense>
  );
}
