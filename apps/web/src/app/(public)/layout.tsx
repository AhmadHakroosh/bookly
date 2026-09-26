import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { LogoMark } from "@/components/brand/logo";
import { accentVars, workspaceBrand } from "@/server/brand";
import { isCloud } from "@/server/platform";
import { getCurrentWorkspace } from "@/server/workspace";
import { loadEnv } from "@bookly/config";
import type { Metadata } from "next";
import { hasFeature } from "@/server/limits";
import { publicBaseUrl } from "@/server/urls";

/**
 * Titles on a workspace host: the workspace's own name by default, and no "— Bookly" suffix on
 * plans that remove Bookly branding, matching the footer rule. Workspaces without a
 * description fall back to the root layout's.
 */
export async function generateMetadata(): Promise<Metadata> {
  const ws = await getCurrentWorkspace();
  if (!ws) return {};
  const own = hasFeature(ws, "removeBranding");
  return {
    title: { default: ws.name, template: own ? "%s" : "%s — Bookly" },
    description: ws.description ?? undefined,
    alternates: { canonical: `${await publicBaseUrl(ws)}/` },
  };
}

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

/**
 * Every guest-facing page (profiles, event pages, manage links, routing forms, waitlists) sits
 * in this shell: the workspace's name and mark on top, the plan's footer at the bottom. On plans
 * that remove Bookly branding the workspace's own logo and colour take over (buttons, selected
 * days and focus rings follow the accent) and the "Powered by Bookly" line disappears. Embeds
 * get the bare page.
 */
async function Shell({ children }: { children: React.ReactNode }) {
  const ws = await getCurrentWorkspace();
  const embedded = (await headers()).get("x-bookly-embed") === "1";
  if (ws?.suspendedAt)
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">This booking page is unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">The workspace has been suspended.</p>
      </main>
    );
  const brand = workspaceBrand(ws);
  const style = accentVars(brand) as React.CSSProperties | undefined;
  if (embedded)
    return (
      <main className="flex-1" style={style}>
        {children}
      </main>
    );
  const footer = ws?.settings.footerText || (brand.own ? brand.name : null);
  // Bookly's line links to the product: the marketing site in cloud mode, the repo elsewhere.
  const booklyUrl = isCloud() ? loadEnv().APP_URL : "https://github.com/AhmadHakroosh/bookly";
  return (
    <div className="flex flex-1 flex-col" style={style}>
      {ws && (
        <header className="mx-auto w-full max-w-4xl px-4 pt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
            aria-label={`${ws.name} home`}
          >
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="" className="size-7 rounded-md object-contain" />
            ) : (
              <LogoMark className="size-7" accent={brand.accent} />
            )}
            <span>{ws.name}</span>
          </Link>
        </header>
      )}
      <main className="flex-1">{children}</main>
      <footer className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
        <span>{footer}</span>
        {brand.poweredBy && (
          <a
            href={booklyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            Powered by <LogoMark className="size-3.5" /> <span className="font-medium">Bookly</span>
          </a>
        )}
      </footer>
    </div>
  );
}
