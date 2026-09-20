import { NextResponse } from "next/server";
import { isServableHost } from "@/server/domains";

/**
 * Caddy on-demand TLS "ask" endpoint: 200 when we serve this host, 404 otherwise.
 * https://caddyserver.com/docs/automatic-https#on-demand-tls
 */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain")?.toLowerCase();
  if (!domain) return new NextResponse("missing domain", { status: 400 });
  return (await isServableHost(domain))
    ? new NextResponse("ok")
    : new NextResponse("unknown domain", { status: 404 });
}
