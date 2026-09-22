import Link from "next/link";
import { Suspense } from "react";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset your password", robots: { index: false } };

async function ForgotPage({ searchParams }: PageProps<"/forgot-password">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/admin";
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email and we will send you a link to choose a new password.
        </p>
        <div className="mt-8">
          <ForgotForm next={target} />
        </div>
        <p className="mt-6 text-sm">
          <Link href="/login" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ForgotPageBoundary(props: PageProps<"/forgot-password">) {
  return (
    <Suspense fallback={null}>
      <ForgotPage {...props} />
    </Suspense>
  );
}
