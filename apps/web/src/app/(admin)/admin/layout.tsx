import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { isCloud } from "@/server/platform";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { MenuIcon } from "lucide-react";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={null}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const [session, workspace, role] = await Promise.all([
    getSession(),
    getCurrentWorkspace(),
    getStaffRole(),
  ]);
  if (!session) redirect("/login?next=/admin");
  if (!role) redirect("/login?error=staff");

  const signOut = async () => {
    "use server";
    await auth.api.signOut({ headers: await headers() });
    redirect("/login");
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open navigation"
                  />
                }
              >
                <MenuIcon className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 overflow-y-auto p-4">
                <SheetTitle className="mb-4 font-semibold">
                  {workspace?.name ?? "Bookly"}
                </SheetTitle>
                <AdminNav cloud={isCloud()} />
              </SheetContent>
            </Sheet>
            <Link href="/admin" className="font-semibold tracking-tight">
              {workspace?.name ?? "Bookly"}
            </Link>
            <Link
              href="/"
              className="ml-2 hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              Booking page ↗
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {session.user.email}
            </span>
            <ThemeToggle />
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r p-4 lg:block">
          <AdminNav cloud={isCloud()} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">
          <div className="mx-auto max-w-6xl">
            {workspace?.suspendedAt && (
              <p className="mb-6 rounded-md border border-destructive/40 p-3 text-sm">
                This workspace is suspended
                {workspace.suspendReason ? `: ${workspace.suspendReason}` : ""}. Public booking
                pages are offline. Contact support to resolve this.
              </p>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
