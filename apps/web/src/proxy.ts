import { NextResponse, type NextRequest } from "next/server";
import { resolveWorkspaceByHost } from "@/server/tenancy";
import { WORKSPACE_HEADER } from "@/server/workspace";

/**
 * 1. Resolve the workspace for this host and pass it to the app as a request header.
 * 2. First run (no workspace yet) → force the setup wizard.
 * 3. /admin requires a session cookie (full check happens in the admin layout).
 */
function meetHost(): string | null {
  const u = process.env.MEET_URL;
  if (!u) return null;
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
}

const PLATFORM_HOST = (() => {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3002").host.toLowerCase();
  } catch {
    return "";
  }
})();
const CLOUD = process.env.TENANCY === "multi";
/** Top-level paths that exist under app/(platform)/platform; anything else is a 404 on the platform host. */
const MARKETING_PATHS = new Set([
  "",
  "pricing",
  "signup",
  "workspaces",
  "console",
  "about",
  "contact",
  "security",
  "privacy",
  "terms",
  "changelog",
  "og",
]);
/**
 * The host a request is really for. After a server-action `redirect()`, Next renders the
 * target with an internal request whose Host is the server's own address and the original host
 * in X-Forwarded-Host, so the forwarded header wins.
 */
function requestHost(request: NextRequest): string {
  return (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]!
    .trim()
    .toLowerCase();
}

/**
 * Rewrite to a path no route can match, so Next answers with its not-found page and a real 404
 * status. (`/not-found` itself would match the public `[username]` route and stream a 200.)
 */
const notFound = (req: NextRequest) =>
  NextResponse.rewrite(new URL("/_/404/_/404", req.url), { status: 404 });

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = requestHost(request);

  // www is not a tenant: send it to the apex with the path intact.
  if (CLOUD && host === `www.${PLATFORM_HOST}`) {
    const url = request.nextUrl.clone();
    url.host = PLATFORM_HOST;
    return NextResponse.redirect(url, 308);
  }
  // Cloud mode: the platform host serves marketing, sign-up, pricing and the operator console.
  if (CLOUD && host === PLATFORM_HOST) {
    if (pathname.startsWith("/platform")) return notFound(request);
    if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return NextResponse.next();
    // Auth redirects (magic links, sign-in) land on the platform host; the admin lives on a
    // workspace host, so send people to the chooser instead of a 404.
    if (pathname.startsWith("/admin"))
      return NextResponse.redirect(new URL("/workspaces", request.url));
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/forgot-password") ||
      pathname.startsWith("/reset-password") ||
      pathname.startsWith("/docs") ||
      pathname.startsWith("/accept-invitation")
    )
      return NextResponse.next();
    const url = request.nextUrl.clone();
    const top = pathname.split("/")[1] ?? "";
    // A path that no route matches gives a routing-level 404 (status included), which a
    // rewrite's `status` option would not.
    if (!MARKETING_PATHS.has(top)) return notFound(request);
    url.pathname = `/platform${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }
  if (pathname.startsWith("/platform")) return notFound(request);

  // Built-in video on its own host (MEET_URL, e.g. meet.example.com): /<room> → /meet/<room>.
  const mh = meetHost();
  if (mh && host === mh && !pathname.startsWith("/meet/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/meet" : `/meet${pathname}`;
    return NextResponse.rewrite(url);
  }
  // /setup is rare and must see a just-deleted workspace as gone, so it skips the 30s cache.
  const workspace = await resolveWorkspaceByHost(host, { fresh: pathname.startsWith("/setup") });

  if (!workspace) {
    if (pathname.startsWith("/api/")) return NextResponse.next();
    // Cloud: unknown tenant host → nothing here. Self-host: first run → setup wizard.
    if (CLOUD) return notFound(request);
    // Auth pages stay reachable so an existing user can sign in and own the new workspace.
    if (
      pathname.startsWith("/setup") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/forgot-password") ||
      pathname.startsWith("/reset-password")
    )
      return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }
  if (pathname.startsWith("/setup")) return NextResponse.redirect(new URL("/admin", request.url));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(WORKSPACE_HEADER, workspace.workspaceId);
  if (request.nextUrl.searchParams.get("embed") === "1") requestHeaders.set("x-bookly-embed", "1");

  if (
    pathname.startsWith("/admin") &&
    !request.cookies.getAll().some((c) => c.name.includes("session_token"))
  ) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/|.*\\.[\\w]+$).*)"],
};
