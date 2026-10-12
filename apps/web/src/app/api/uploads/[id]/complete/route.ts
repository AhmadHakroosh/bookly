import { NextResponse } from "next/server";
import { completeUpload, fileUrl } from "@/server/files";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** Step two of a direct upload: the bytes are in place, so the file becomes ready. */
export async function POST(_req: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) {
  const { id } = await ctx.params;
  const [session, role, ws] = await Promise.all([
    getSession(),
    getStaffRole(),
    getCurrentWorkspace(),
  ]);
  if (!session || !role || !ws)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const file = await completeUpload(ws, id);
    return NextResponse.json({
      id: file.id,
      url: fileUrl(file.id),
      name: file.name,
      size: file.size,
      mime: file.mime,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
