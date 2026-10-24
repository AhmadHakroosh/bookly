import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Logo } from "@/components/brand/logo";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/server/platform";
import { getSession } from "@/server/session";
import { PLANS } from "@bookly/cloud";
import { WebMcpTools } from "@/components/webmcp-tools";
import { ARD_PATH } from "@/lib/ard";
import { listDocs } from "@/server/docs";
import { MENUS, SITE, siteUrl } from "./site";
import { Reveal } from "./reveal";
import { MegaMenuNav } from "./_site/mega-menu";
import { MobileMenu } from "./_site/mobile-menu";
import { SiteFooter } from "./_site/footer";

/** Handwriting for the concepts' annotations ("Less admin. More progress."); marketing only. */
const hand = Caveat({ subsets: ["latin"], variable: "--font-caveat", display: "swap" });

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
  return (
    <>
      {/* Agentic Resource Discovery: where an AI agent finds what this site offers it. */}
      <link rel="ard" href={ARD_PATH} />
      <Suspense fallback={null}>
        <AgentTools />
      </Suspense>
      <Shell>{children}</Shell>
    </>
  );
}

/** WebMCP tools for agents driving a browser that supports them; data the page has anyway. */
async function AgentTools() {
  const docs = await listDocs();
  const base = siteUrl();
  return (
    <WebMcpTools
      base={base}
      plans={Object.values(PLANS).map((p) => ({
        id: p.id,
        name: p.name,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        minSeats: p.minSeats,
        highlights: p.highlights,
      }))}
      docs={docs.map((d) => ({
        title: d.title,
        url: `${base}/docs/${d.slug}`,
        description: d.description,
      }))}
    />
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
      <Link
        href="/login"
        className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-foreground/80 hover:text-foreground sm:inline-flex"
      >
        Sign in
      </Link>
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
      <form
        action={signOut}
        toolname="sign_out"
        tooldescription="Sign the current person out of Bookly."
      >
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
      <Link href="/login" className="rounded-md py-2 font-medium">
        Sign in
      </Link>
    );
  return (
    <>
      <Link href="/workspaces" className="rounded-md py-2 font-medium">
        Your workspaces
      </Link>
      {admin && (
        <Link href="/console" className="rounded-md py-2 font-medium">
          Console
        </Link>
      )}
      <form
        action={signOut}
        toolname="sign_out"
        tooldescription="Sign the current person out of Bookly."
      >
        <SubmitButton
          variant="ghost"
          className="h-auto w-full justify-start rounded-md px-0 py-2 text-base font-medium"
        >
          Sign out
        </SubmitButton>
      </form>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const menus = [MENUS.product, MENUS.solutions, MENUS.resources];
  const pricing = { href: "/pricing", label: "Pricing" };
  return (
    <div className={`${hand.variable} flex min-h-full flex-1 flex-col`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="shrink-0" aria-label="Bookly home">
            <Logo size={28} />
          </Link>
          <MegaMenuNav menus={menus} pricing={pricing} />
          <div className="flex items-center gap-1.5">
            <Suspense fallback={<span className="hidden h-9 w-16 sm:inline-block" aria-hidden />}>
              <SessionNav />
            </Suspense>
            <Button variant="ink" nativeButton={false} render={<Link href="/signup" />}>
              Start free
            </Button>
            <MobileMenu
              menus={menus}
              pricing={pricing}
              session={
                <Suspense fallback={null}>
                  <SessionMenu />
                </Suspense>
              }
            />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      {/* Mounted with the streamed shell: its DOM writes must come after hydration of the page. */}
      <Reveal />
    </div>
  );
}
