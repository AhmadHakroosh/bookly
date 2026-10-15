import { connection } from "next/server";
import { ardManifestFor, onPlatformHostOrNull } from "@/server/ard";

/** The predecessor path of `/.well-known/ard.json`; the same manifest, for older consumers. */
export async function GET() {
  await connection();
  const base = await onPlatformHostOrNull();
  if (!base) return new Response("Not found", { status: 404 });
  return Response.json(ardManifestFor(base), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
