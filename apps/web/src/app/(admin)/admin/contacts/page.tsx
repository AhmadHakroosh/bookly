import { ContactsSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { Suspense } from "react";
import { SearchIcon, UsersIcon } from "lucide-react";
import { connection } from "next/server";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { StatusChip } from "@/components/ui/status-chip";
import { fmtDate } from "@/lib/time";
import { listContacts } from "@/server/contacts";
import { stageChoices } from "@/server/pipelines";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Contacts" };

async function ContactsPage({ searchParams }: PageProps<"/admin/contacts">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  // Follow-ups due are about now: render per request.
  await connection();
  const now = new Date();
  const tz = (await getProfileByUser(ws.id, session.user.id))?.timezone ?? ws.timezone;
  const q = typeof sp.q === "string" ? sp.q : "";
  const { choices, keyOf } = await stageChoices(ws);
  const choice = (key: string) => choices.find((s) => s.key === key);
  const stage = typeof sp.stage === "string" && choice(sp.stage) ? sp.stage : undefined;
  const rows = await listContacts(ws.id, { q, stage, viewer: session.user.id });
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
      <PageHeader
        title="Contacts"
        description={
          <>Everyone who booked, joined a waitlist or filled a routing form, with their history.</>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          label="Stage"
          items={[
            { href: href({ stage: "" }), label: "All", active: !stage },
            ...choices.map((s) => ({
              href: href({ stage: s.key }),
              label: s.name,
              active: stage === s.key,
            })),
          ]}
        />
        <form className="relative w-full sm:w-72" role="search">
          {stage && <input type="hidden" name="stage" value={stage} />}
          <SearchIcon
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            aria-label="Search contacts"
            placeholder="Search name, email, company"
            className="h-8 pl-9"
          />
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={q || stage ? "No contacts match." : "No contacts yet."}
          description={q || stage ? undefined : "They appear as soon as someone books."}
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card p-1.5">
          {rows.map((c) => {
            const st = choice(keyOf(c));
            const name = c.name || c.email;
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/contacts/${c.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Avatar size="lg" aria-hidden>
                    <AvatarFallback>{initialsOf(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {name}
                      {c.company ? (
                        <span className="font-normal text-muted-foreground"> · {c.company}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {c.email} · {c.bookingsCount} booking{c.bookingsCount === 1 ? "" : "s"} · last
                      activity {fmtDate(c.lastActivityAt, tz)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.nextFollowUpAt && c.nextFollowUpAt <= now && (
                      <StatusChip tone="warning">Follow-up due</StatusChip>
                    )}
                    {c.tags.slice(0, 3).map((t) => (
                      <StatusChip key={t} tone="neutral">
                        {t}
                      </StatusChip>
                    ))}
                    <StatusChip tone={st?.emphasis ? "success" : "info"} dot>
                      {st?.name ?? keyOf(c)}
                    </StatusChip>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ContactsPageBoundary(props: PageProps<"/admin/contacts">) {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <ContactsPage {...props} />
    </Suspense>
  );
}
