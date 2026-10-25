import { hasFlag } from "@/server/flags";
import { ApplyError, exportOwnData } from "@/server/hiring/apply";
import { getCurrentWorkspace } from "@/server/workspace";

/** "Download my data": everything the candidate sent, as a JSON file they keep. */
export async function GET(_req: Request, ctx: RouteContext<"/applications/[token]/data">) {
  const { token } = await ctx.params;
  const ws = await getCurrentWorkspace();
  if (!ws || !(await hasFlag(ws, "hiring"))) return new Response("Not found", { status: 404 });
  try {
    const data = await exportOwnData(ws, token);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="my-application.json"',
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ApplyError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
