import { NextResponse } from "next/server";
import { receiveUpload } from "@/server/files";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** The local driver's upload target: the body is the file, exactly the announced size. */
export async function PUT(req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { id } = await ctx.params;
  const [session, role, ws] = await Promise.all([
    getSession(),
    getStaffRole(),
    getCurrentWorkspace(),
  ]);
  if (!session || !role || !ws)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const file = await receiveUpload(ws, id, Buffer.from(await req.arrayBuffer()));
    return NextResponse.json({ id: file.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
