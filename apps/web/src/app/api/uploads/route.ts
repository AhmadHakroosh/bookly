import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTarget } from "@/server/drive";
import { createUpload } from "@/server/files";
import { hasFlag } from "@/server/flags";
import { LimitError } from "@/server/limits";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

const body = z.object({
  kind: z.enum(["attachment", "background"]),
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().min(3).max(100),
  size: z.number().int().positive(),
  owner: z.object({ type: z.string().max(40), id: z.string().max(80) }).optional(),
  /** Drive uploads (0.18.0): where the file goes; the server checks and resolves it. */
  drive: z
    .object({
      space: z.enum(["personal", "team"]).optional(),
      folderId: z.string().max(80).nullish(),
      contactId: z.string().max(80).nullish(),
      taskId: z.string().max(80).nullish(),
    })
    .optional(),
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
    const { drive, ...rest } = parsed.data;
    if (drive && (rest.kind !== "attachment" || !(await hasFlag(ws, "files"))))
      return NextResponse.json(
        { error: "Files are not enabled for this workspace." },
        { status: 404 },
      );
    const placement = drive
      ? await resolveTarget({ userId: session.user.id, ws }, drive)
      : undefined;
    const ticket = await createUpload({ ws, ...rest, userId: session.user.id, drive: placement });
    return NextResponse.json({ id: ticket.file.id, upload: ticket.upload });
  } catch (e) {
    const status = e instanceof LimitError ? 402 : 400;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
