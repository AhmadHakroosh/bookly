import { hasFlag } from "@/server/flags";
import { statusByToken } from "@/server/hiring/apply";
import { getCurrentWorkspace } from "@/server/workspace";

const ics = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** "Add the decision date to your calendar": an all-day event on the decisions-by date. */
export async function GET(_req: Request, ctx: RouteContext<"/applications/[token]/calendar">) {
  const { token } = await ctx.params;
  const ws = await getCurrentWorkspace();
  if (!ws || !(await hasFlag(ws, "hiring"))) return new Response("Not found", { status: 404 });
  const r = await statusByToken(ws, token);
  const when = r.kind === "ok" ? r.view.cohort?.decidesBy : null;
  if (r.kind !== "ok" || !when) return new Response("Not found", { status: 404 });
  const next = new Date(when.getTime() + 86_400_000);
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bookly//Applications//EN",
    "BEGIN:VEVENT",
    `UID:decision-${r.view.application.id}@bookly`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day(when)}`,
    `DTEND;VALUE=DATE:${day(next)}`,
    `SUMMARY:${ics(`Decisions expected: ${r.view.opportunity.title}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="decision-date.ics"',
      "cache-control": "no-store",
    },
  });
}
