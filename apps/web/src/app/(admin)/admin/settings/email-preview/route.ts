import { NextResponse } from "next/server";
import { connection } from "next/server";
import { previewMail } from "@/server/email-preview";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** Renders one guest email with sample data and the workspace's current wording and brand. */
export async function GET(req: Request) {
  await connection();
  const { session } = await requireStaff();
  const ws = await getCurrentWorkspace();
  if (!ws) return NextResponse.json({ error: "No workspace" }, { status: 404 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "confirmation";
  const html = await previewMail(ws, { id: session.user.id, name: session.user.name }, kind);
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
