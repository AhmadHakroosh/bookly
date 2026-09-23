import { NextResponse } from "next/server";
import { getContactById, setEmailOptOut } from "@/server/contacts";
import { readUnsubscribeToken } from "@/server/unsubscribe";

/**
 * One-click unsubscribe (RFC 8058): mailbox providers POST `List-Unsubscribe=One-Click` to the
 * List-Unsubscribe URL without showing the user a page.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const id = readUnsubscribeToken(token);
  const c = id ? await getContactById(id) : null;
  if (!c) return NextResponse.json({ error: "invalid" }, { status: 404 });
  if (!c.emailOptOut) await setEmailOptOut(c.workspaceId, c.id, true, "contact");
  return NextResponse.json({ ok: true });
}
