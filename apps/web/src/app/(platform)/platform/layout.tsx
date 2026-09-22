import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ExternalLinkIcon, MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { GitHubIcon, Logo, LogoMark } from "@/components/brand/logo";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/server/platform";
import { getSession } from "@/server/session";
import { FOOTER, NAV, SITE } from "./site";
import { Reveal } from "./reveal";

async function signOut() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

export const metadata: Metadata = {
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s — ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "scheduling",
    "booking page",
    "meeting notes",
    "AI meeting recap",
    "open source Calendly alternative",
    "self-hosted scheduling",
  ],
  robots: { index: true, follow: true },
};

/**
 * The proxy only routes the platform host here (and 404s /platform elsewhere), so the shell is
 * static: header, footer and page content render at once and only the session-dependent nav
 * items stream in behind their own boundary. That keeps navigations instant.
 */
export default function PlatformLayout({ children }: LayoutProps<"/platform">) {
  return <Shell>{children}</Shell>;
}

function NavLinks({ className = "" }: { className?: string }) {
  return (
    <>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          target={"external" in n && n.external ? "_blank" : undefined}
          rel={"external" in n && n.external ? "noreferrer" : undefined}
          className={`text-muted-foreground transition-colors hover:text-foreground ${className}`}
        >
          {n.label}
        </Link>
      ))}
    </>
  );
}

async function sessionState() {
  const session = await getSession();
  return { session, admin: !!session && isPlatformAdmin(session.user.email) };
}

/** Desktop header: sign in, or workspaces / console / sign out. Streams in after the shell. */
async function SessionNav() {
  const { session, admin } = await sessionState();
  if (!session)
    return (
      <Button
        variant="ghost"
        nativeButton={false}
        render={<Link href="/login" />}
        className="hidden sm:inline-flex"
      >
        Sign in
      </Button>
    );
  return (
    <>
      <Button
        variant="ghost"
        nativeButton={false}
        render={<Link href="/workspaces" />}
        className="hidden sm:inline-flex"
      >
        Your workspaces
      </Button>
      {admin && (
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href="/console" />}
          className="hidden sm:inline-flex"
        >
          Console
        </Button>
      )}
      <form action={signOut}>
        <SubmitButton variant="ghost" className="hidden sm:inline-flex">
          Sign out
        </SubmitButton>
      </form>
    </>
  );
}

/** The same items inside the mobile sheet. */
async function SessionMenu() {
  const { session, admin } = await sessionState();
  if (!session)
    return (
      <Link href="/login" className="rounded-md px-2 py-2">
        Sign in
      </Link>
    );
  return (
    <>
      <Link href="/workspaces" className="rounded-md px-2 py-2">
        Your workspaces
      </Link>
      {admin && (
        <Link href="/console" className="rounded-md px-2 py-2">
          Console
        </Link>
      )}
      <form action={signOut}>
        <button type="submit" className="w-full rounded-md px-2 py-2 text-left">
          Sign out
        </button>
      </form>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="shrink-0" aria-label="Bookly home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-6 text-sm md:flex">
            <NavLinks />
          </nav>
          <div className="flex items-center gap-1.5">
            <a
              href={SITE.github}
              target="_blank"
              rel="noreferrer"
              aria-label="Bookly on GitHub"
              className="hidden rounded-md p-2 text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              <GitHubIcon className="size-4" />
            </a>
            <ThemeToggle />
            <Suspense fallback={<span className="hidden h-8 w-16 sm:inline-block" aria-hidden />}>
              <SessionNav />
            </Suspense>
            <Button nativeButton={false} render={<Link href="/signup" />}>
              Get started
            </Button>
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Menu" />
                }
              >
                <MenuIcon />
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle>
                    <Logo />
                  </SheetTitle>
                </SheetHeader>
                <nav aria-label="Mobile" className="flex flex-col gap-1 px-4 text-base">
                  <NavLinks className="rounded-md px-2 py-2" />
                  <Link
                    href={SITE.github}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md px-2 py-2 text-muted-foreground hover:text-foreground"
                  >
                    GitHub
                  </Link>
                  <hr className="my-2" />
                  <Suspense fallback={null}>
                    <SessionMenu />
                  </Suspense>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">{SITE.tagline}</p>
            <p className="text-xs text-muted-foreground">
              Open source under AGPL-3.0. Self-host it, or let us run it for you.
            </p>
          </div>
          {Object.entries(FOOTER).map(([group, links]) => (
            <nav key={group} aria-label={group}>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      target={"external" in l && l.external ? "_blank" : undefined}
                      rel={"external" in l && l.external ? "noreferrer" : undefined}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {l.label}
                      {"external" in l && l.external && (
                        <ExternalLinkIcon className="size-3 opacity-60" aria-hidden />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <LogoMark className="size-4" />© {SITE.updated.slice(0, 4)} {SITE.name}. Built by{" "}
              {SITE.operator}.
            </span>
            <span>
              <a href={`mailto:${SITE.supportEmail}`} className="hover:text-foreground">
                {SITE.supportEmail}
              </a>
            </span>
          </div>
        </div>
      </footer>
      {/* Mounted with the streamed shell: its DOM writes must come after hydration of the page. */}
      <Reveal />
    </div>
  );
}
