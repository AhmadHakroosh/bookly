import { PREVIEWABLE, canSeeFile, readFileToken } from "@/server/drive";
import { getFileAnywhere } from "@/server/files";
import { getStorage } from "@bookly/storage";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/**
 * `/files/<id>`: the one address every stored file has. Public files (avatars, logos,
 * backgrounds) are streamed with a year-long immutable cache, so the edge serves repeats and
 * the id never changes meaning (a new upload is a new id). Private files need a member of the
 * owning workspace who may see the file (or a signed link sent by email), checked on every
 * request, and are streamed by the app itself: never a redirect to a presigned bucket URL,
 * which anyone holding it could open, signed in or not, until it expired.
 */
export async function GET(req: Request, ctx: RouteContext<"/files/[id]">) {
  const { id } = await ctx.params;
  const file = await getFileAnywhere(id);
  // An infected file is never served (the scan hook removes it at upload; this is the backstop).
  if (!file || file.status !== "ready" || file.deletedAt || file.scanStatus === "infected")
    return new Response("Not found", { status: 404 });
  // Only images and PDFs open in the browser (unless `?download=1`); anything else downloads.
  // Files people sent through a public form open in the browser only once scanned clean.
  const forceDownload =
    new URL(req.url).searchParams.get("download") === "1" ||
    (file.scanStatus !== null && file.scanStatus !== "clean") ||
    (file.ownerType === "form_response" && file.scanStatus !== "clean");
  const inline = !forceDownload && (file.visibility === "public" || PREVIEWABLE.has(file.mime));
  const disposition = `${inline ? "inline" : "attachment"}; filename="${file.name.replace(/["\r\n]/g, "")}"`;

  if (file.visibility === "public") {
    const body = await getStorage().stream(file.key);
    return new Response(body, {
      headers: {
        "content-type": file.mime,
        "content-length": String(file.size),
        "content-disposition": disposition,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        ...(file.sha256 && { etag: `"${file.sha256.slice(0, 32)}"` }),
      },
    });
  }

  // A link sent with an email (`?t=`) opens without signing in until it expires.
  const token = new URL(req.url).searchParams.get("t");
  if (!readFileToken(file.id, token)) {
    const [ws, role, session] = await Promise.all([
      getCurrentWorkspace(),
      getStaffRole(),
      getSession(),
    ]);
    if (!ws || ws.id !== file.workspaceId || !role || !session)
      return new Response("Not found", { status: 404 });
    // Drive files follow the drive's rules (someone's My files stay theirs).
    if (file.space && !(await canSeeFile({ userId: session.user.id, ws }, file.id)))
      return new Response("Not found", { status: 404 });
  }
  const body = await getStorage().stream(file.key);
  return new Response(body, {
    headers: {
      "content-type": file.mime,
      "content-length": String(file.size),
      "content-disposition": disposition,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}
