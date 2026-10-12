import { downloadUrl, getFileAnywhere } from "@/server/files";
import { getStorage } from "@bookly/storage";
import { getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/**
 * `/files/<id>`: the one address every stored file has. Public files (avatars, logos,
 * backgrounds) are streamed with a year-long immutable cache, so the edge serves repeats and
 * the id never changes meaning (a new upload is a new id). Private files need a member of the
 * owning workspace and come back as a redirect to a short-lived bucket URL, so the bytes never
 * pass through a function; on the local driver the app streams them itself.
 */
export async function GET(_req: Request, ctx: RouteContext<"/files/[id]">) {
  const { id } = await ctx.params;
  const file = await getFileAnywhere(id);
  if (!file || file.status !== "ready") return new Response("Not found", { status: 404 });
  const disposition = `inline; filename="${file.name.replace(/["\r\n]/g, "")}"`;

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

  const [ws, role] = await Promise.all([getCurrentWorkspace(), getStaffRole()]);
  if (!ws || ws.id !== file.workspaceId || !role) return new Response("Not found", { status: 404 });
  const direct = await downloadUrl(file);
  if (direct) return Response.redirect(direct, 302);
  const body = await getStorage().stream(file.key);
  return new Response(body, {
    headers: {
      "content-type": file.mime,
      "content-length": String(file.size),
      "content-disposition": disposition,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
