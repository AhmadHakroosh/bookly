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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Built-in video on its own host (MEET_URL, e.g. meet.example.com): /<room> → /meet/<room>.
  const mh = meetHost();
  if (mh && request.headers.get("host") === mh && !pathname.startsWith("/meet/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/meet" : `/meet${pathname}`;
    return NextResponse.rewrite(url);
  }
  const workspace = await resolveWorkspaceByHost(request.headers.get("host"));

  if (!workspace) {
    if (pathname.startsWith("/setup") || pathname.startsWith("/api/")) return NextResponse.next();
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
