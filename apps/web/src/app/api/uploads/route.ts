import { NextResponse } from "next/server";
import { z } from "zod";
import { createUpload } from "@/server/files";
import { LimitError } from "@/server/limits";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

const body = z.object({
  kind: z.enum(["attachment", "background"]),
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().min(3).max(100),
  size: z.number().int().positive(),
  owner: z.object({ type: z.string().max(40), id: z.string().max(80) }).optional(),
});

/**
 * Step one of a direct upload: a member announces a file and gets back where to PUT it
 * (a presigned bucket URL, or `/api/uploads/<id>` on the local driver) plus the file id to
 * confirm with `/api/uploads/<id>/complete`. Images that need resizing (avatars, logos) go
 * through their own server actions instead.
 */
export async function POST(req: Request) {
  const [session, role, ws] = await Promise.all([
    getSession(),
    getStaffRole(),
    getCurrentWorkspace(),
  ]);
  if (!session || !role || !ws)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const ticket = await createUpload({ ws, ...parsed.data, userId: session.user.id });
    return NextResponse.json({ id: ticket.file.id, upload: ticket.upload });
  } catch (e) {
    const status = e instanceof LimitError ? 402 : 400;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
