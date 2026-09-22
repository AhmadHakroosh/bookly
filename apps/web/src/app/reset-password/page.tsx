import Link from "next/link";
import { Suspense } from "react";
import { ResetForm } from "./reset-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Choose a new password", robots: { index: false } };

async function ResetPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/admin";
  const invalid = sp.error === "INVALID_TOKEN" || sp.error === "invalid_token";
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        {token && !invalid ? (
          <div className="mt-8">
            <ResetForm token={token} next={next} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            This reset link is missing or has expired.{" "}
            <Link href="/forgot-password" className="underline underline-offset-4">
              Request a new one
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}

export default function ResetPageBoundary(props: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ResetPage {...props} />
    </Suspense>
  );
}
