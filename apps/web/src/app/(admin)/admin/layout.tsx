import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { AccountMenu } from "@/components/account-menu";
import { LogoMark } from "@/components/brand/logo";
import { PaneLinks } from "@/components/pane";
import { NotificationBell } from "@/components/notification-bell";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { CommandMenu } from "@/components/shell/command-menu";
import { HelpMenu } from "@/components/shell/help-menu";
import { MobileNav } from "@/components/shell/mobile-nav";
import type { NavOptions } from "@/components/shell/nav";
import { getActor } from "@/server/access";
import { reviewsOwed } from "@/server/hiring/queries";
import { UpdateNotice } from "@/components/update-notice";
import { hasFlag } from "@/server/flags";
import { canGuest, canTeam, unreadThreads } from "@/server/messages";
import { KIND_KEYS, channelsFor, unreadCount } from "@/server/notifications";
import { isCloud, listUserWorkspaces, platformUrl } from "@/server/platform";
import { vapidPublicKey } from "@/server/push";
import { getProfileByUser } from "@/server/scheduling";
import { getSession, getStaffRole, isManager } from "@/server/session";
import { isCollaborator } from "@/lib/roles";
import { getCurrentWorkspace } from "@/server/workspace";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
  // The installable host app (start_url /admin); guests' pages keep the root manifest.
  manifest: "/admin.webmanifest",
};

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
  const [tasks, files, messagesFlag, hiring] = workspace
    ? await Promise.all([
        hasFlag(workspace, "task_board"),
        hasFlag(workspace, "files"),
        hasFlag(workspace, "messages"),
        hasFlag(workspace, "hiring"),
      ])
    : [false, false, false, false];
  if (!session) redirect("/login?next=/admin");
  if (!role) redirect("/login?error=staff");
  const messages =
    workspace && messagesFlag && (canGuest(workspace) || canTeam(workspace))
      ? { unread: await unreadThreads({ userId: session.user.id, ws: workspace }) }
      : null;
  const profile = workspace ? await getProfileByUser(workspace.id, session.user.id) : null;
  // The hiring sidebar's Reviews count: what this member owes.
  const actor = hiring && !isCollaborator(role) ? await getActor() : null;
  const owed = actor ? await reviewsOwed(actor) : 0;
  const bookingPageHref = profile ? `/${profile.username}` : null;

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
  const nav: NavOptions = {
    cloud: isCloud(),
    manager: isManager(role),
    collaborator: isCollaborator(role),
    tasks,
    files,
    messages,
    hiring,
    reviewsOwed: owed,
  };
  const account = {
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
    bookingPageHref,
    signOut,
  };
  const sidebar = (
    <AppSidebar
      nav={nav}
      account={account}
      workspace={{
        current: {
          id: workspace?.id ?? "",
          name: workspace?.name ?? "Bookly",
          logoUrl: workspace?.settings.branding?.logoUrl,
        },
        ...switcher,
      }}
    />
  );
  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 overflow-y-auto border-e border-sidebar-border bg-sidebar lg:block">
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 sm:px-4 lg:px-6">
          <MobileNav title={workspace?.name ?? "Bookly"}>{sidebar}</MobileNav>
          <Link
            href="/admin"
            aria-label="Bookly home"
            className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
          >
            <LogoMark className="size-6" />
          </Link>
          <Breadcrumbs nav={nav} className="hidden min-w-0 shrink-0 md:block md:w-1/3 lg:w-1/4" />
          <div className="flex min-w-0 flex-1 justify-end md:justify-center">
            <CommandMenu nav={nav} bookingPageHref={bookingPageHref} />
          </div>
          <div className="flex items-center gap-1">
            {workspace && (
              <Suspense fallback={null}>
                <HeaderBell workspace={workspace} userId={session.user.id} />
              </Suspense>
            )}
            <HelpMenu supportHref={supportHref} />
            <AccountMenu {...account} />
          </div>
        </header>
        <PaneLinks />
        <main className="min-w-0 flex-1 px-4 py-6 sm:py-8 lg:px-8">
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

/** The bell, once notifications are enabled for this workspace. */
async function HeaderBell({
  workspace,
  userId,
}: {
  workspace: NonNullable<Awaited<ReturnType<typeof getCurrentWorkspace>>>;
  userId: string;
}) {
  if (!(await hasFlag(workspace, "notifications"))) return null;
  const [unread, profile] = await Promise.all([
    unreadCount(workspace.id, userId),
    getProfileByUser(workspace.id, userId),
  ]);
  const prefs = profile?.notifications ?? {};
  return (
    <NotificationBell
      initialUnread={unread}
      pushKey={vapidPublicKey()}
      desktopKinds={KIND_KEYS.filter((k) => channelsFor(prefs, k).desktop)}
    />
  );
}
