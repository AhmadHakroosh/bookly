import Link from "next/link";
import { Suspense } from "react";
import { CONTACT_STAGES, type ContactStage } from "@bookly/db/schema";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/time";
import { listContacts } from "@/server/contacts";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

export const metadata = { title: "Contacts" };

const STAGE_LABEL: Record<ContactStage, string> = {
  lead: "Lead",
  active: "Active",
  won: "Won",
  lost: "Lost",
};

async function ContactsPage({ searchParams }: PageProps<"/admin/contacts">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  const tz = (await getProfileByUser(ws.id, session.user.id))?.timezone ?? ws.timezone;
  const q = typeof sp.q === "string" ? sp.q : "";
  const stage =
    typeof sp.stage === "string" && (CONTACT_STAGES as readonly string[]).includes(sp.stage)
      ? (sp.stage as ContactStage)
      : undefined;
  const rows = await listContacts(ws.id, { q, stage });
  const href = (over: { q?: string; stage?: string }) => {
    const p = new URLSearchParams();
    const merged = { q, stage: stage ?? "", ...over };
    if (merged.q) p.set("q", merged.q);
    if (merged.stage) p.set("stage", merged.stage);
    const s = p.toString();
    return s ? `/admin/contacts?${s}` : "/admin/contacts";
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Everyone who booked, joined a waitlist or filled a routing form, with their history.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2">
          {stage && <input type="hidden" name="stage" value={stage} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, company"
            className="h-8 w-64 rounded-lg border bg-background px-2 text-sm"
          />
        </form>
        <nav className="flex gap-1 text-sm">
          <Link
            href={href({ stage: "" })}
            className={`rounded-md px-2.5 py-1 ${!stage ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            All
          </Link>
          {CONTACT_STAGES.map((s) => (
            <Link
              key={s}
              href={href({ stage: s })}
              className={`rounded-md px-2.5 py-1 ${stage === s ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {STAGE_LABEL[s]}
            </Link>
          ))}
        </nav>
      </div>
      <ul className="divide-y rounded-xl border text-sm">
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/contacts/${c.id}`}
              className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {c.name || c.email}
                  {c.company ? <span className="text-muted-foreground"> · {c.company}</span> : null}
                </p>
                <p className="truncate text-muted-foreground">
                  {c.email} · {c.bookingsCount} booking{c.bookingsCount === 1 ? "" : "s"} · last
                  activity {fmtDate(c.lastActivityAt, tz)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.nextFollowUpAt && c.nextFollowUpAt <= new Date() && (
                  <Badge variant="destructive">Follow up due</Badge>
                )}
                {c.tags.slice(0, 3).map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
                <Badge
                  variant={c.stage === "active" || c.stage === "won" ? "default" : "secondary"}
                >
                  {STAGE_LABEL[c.stage]}
                </Badge>
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="p-10 text-center text-muted-foreground">
            No contacts yet. They appear as soon as someone books.
          </li>
        )}
      </ul>
    </div>
  );
}

export default function ContactsPageBoundary(props: PageProps<"/admin/contacts">) {
  return (
    <Suspense fallback={null}>
      <ContactsPage {...props} />
    </Suspense>
  );
}
