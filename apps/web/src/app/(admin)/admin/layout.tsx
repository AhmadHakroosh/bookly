import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { UpdateNotice } from "@/components/update-notice";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ExternalLink } from "@/components/links";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { isCloud, listUserWorkspaces, platformUrl } from "@/server/platform";
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

  const switcher = isCloud()
    ? {
        workspaces: (await listUserWorkspaces(session.user.id)).map((w) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          role: w.role,
          url: w.url,
        })),
        allUrl: platformUrl("/workspaces"),
        newUrl: platformUrl("/signup"),
      }
    : undefined;
  // Cloud: email the operator. Self-hosted: the project's issue tracker.
  const supportHref =
    isCloud() && process.env.SUPPORT_EMAIL
      ? `mailto:${process.env.SUPPORT_EMAIL}?subject=Bookly%20support`
      : "https://github.com/AhmadHakroosh/bookly/issues";
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background">
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
                <div className="flex min-h-[calc(100vh-6rem)] flex-col">
                  <AdminNav cloud={isCloud()} supportHref={supportHref} />
                </div>
              </SheetContent>
            </Sheet>
            <WorkspaceSwitcher
              current={{ id: workspace?.id ?? "", name: workspace?.name ?? "Bookly" }}
              workspaces={switcher?.workspaces}
              allUrl={switcher?.allUrl}
              newUrl={switcher?.newUrl}
            />
            <ExternalLink
              href="/"
              className="ml-2 hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Booking page
            </ExternalLink>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {session.user.email}
            </span>
            <ThemeToggle />
            <form action={signOut}>
              <SubmitButton variant="outline">Sign out</SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r p-4 lg:block">
          <AdminNav cloud={isCloud()} supportHref={supportHref} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">
          <div className="admin-page mx-auto max-w-6xl">
            {workspace?.suspendedAt && (
              <p className="mb-6 rounded-md border border-destructive/40 p-3 text-sm">
                This workspace is suspended
                {workspace.suspendReason ? `: ${workspace.suspendReason}` : ""}. Public booking
                pages are offline. Contact support to resolve this.
              </p>
            )}
            <Suspense fallback={null}>
              <UpdateNotice />
            </Suspense>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
