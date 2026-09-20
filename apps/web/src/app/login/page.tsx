import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in", robots: { index: false } };

async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/admin";
  if (await getSession()) redirect(target);
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <div className="mt-8">
          <LoginForm next={target} />
        </div>
      </div>
    </main>
  );
}

/** Suspense boundary for Cache Components: the page reads request data and streams in. */
export default function LoginPageBoundary(props: PageProps<"/login">) {
  return (
    <Suspense fallback={null}>
      <LoginPage {...props} />
    </Suspense>
  );
}
