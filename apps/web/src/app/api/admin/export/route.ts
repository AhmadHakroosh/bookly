import { NextResponse } from "next/server";
import { connection } from "next/server";
import { exportWorkspace } from "@/server/data-rights";
import { getStaffRole, getSession } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** Owner-only JSON download of everything in the workspace (Admin → Settings → Your data). */
export async function GET() {
  await connection();
  const [session, role, ws] = await Promise.all([
    getSession(),
    getStaffRole(),
    getCurrentWorkspace(),
  ]);
  if (!session || !ws) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });
  const data = await exportWorkspace(ws);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="bookly-${ws.slug}-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
