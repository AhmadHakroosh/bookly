import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isCloud, isPlatformAdmin } from "@/server/platform";
import { getSession } from "@/server/session";

async function signOut() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

export const metadata = { title: { default: "Bookly", template: "%s — Bookly" } };

export default function PlatformLayout({ children }: LayoutProps<"/platform">) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  if (!isCloud()) notFound();
  const session = await getSession();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="font-semibold tracking-tight">
            Bookly
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/pricing" className="px-2 text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            {session ? (
              <>
                <Link
                  href="/workspaces"
                  className="px-2 text-muted-foreground hover:text-foreground"
                >
                  Your workspaces
                </Link>
                {isPlatformAdmin(session.user.email) && (
                  <Link
                    href="/console"
                    className="px-2 text-muted-foreground hover:text-foreground"
                  >
                    Console
                  </Link>
                )}
                <form action={signOut}>
                  <button
                    type="submit"
                    className="px-2 text-muted-foreground hover:text-foreground"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className="px-2 text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
            )}
            <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
              Get started
            </Button>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">{children}</main>
      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        Bookly · open-source scheduling, hosted for you.
      </footer>
    </div>
  );
}
