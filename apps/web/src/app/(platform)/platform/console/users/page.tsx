import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { listUsersForConsole } from "@/server/ops";
import { banUser, unbanUser } from "../actions";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Users", robots: { index: false } };

async function UsersPage({ searchParams }: PageProps<"/platform/console/users">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const rows = await listUsersForConsole(q);
  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search email or name"
          className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm sm:w-72 sm:flex-none"
        />
        <button type="submit" className="h-8 shrink-0 rounded-lg border px-3 text-sm">
          Search
        </button>
      </form>
      <ul className="divide-y rounded-xl border text-sm">
        {rows.map(({ u, lastSeen, workspaces }) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 break-words">
              <p className="font-medium">
                {u.name || u.email} <span className="text-muted-foreground">· {u.email}</span>
                {u.banned && (
                  <Badge variant="destructive" className="ml-2">
                    banned
                  </Badge>
                )}
              </p>
              <p className="text-muted-foreground">
                {workspaces || "no workspace"} · joined {u.createdAt.toLocaleDateString()} · last
                seen {lastSeen ? new Date(lastSeen).toLocaleString() : "never"}
                {u.banReason ? ` · ${u.banReason}` : ""}
                {" · "}
                {u.consentAt
                  ? `consented ${u.consentAt.toLocaleDateString()} (terms of ${u.consentVersion ?? "unknown"})`
                  : "no consent record"}
              </p>
            </div>
            {u.banned ? (
              <form action={unbanUser.bind(null, u.id)}>
                <SubmitButton variant="outline">Unban</SubmitButton>
              </form>
            ) : (
              <form action={banUser.bind(null, u.id)} className="flex gap-1">
                <input
                  name="reason"
                  placeholder="Reason"
                  className="h-8 w-40 rounded-md border bg-background px-2 text-sm"
                />
                <SubmitButton variant="ghost">Ban</SubmitButton>
              </form>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="p-8 text-center text-muted-foreground">No users match.</li>
        )}
      </ul>
    </div>
  );
}

export default function UsersPageBoundary(props: PageProps<"/platform/console/users">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UsersPage {...props} />
    </Suspense>
  );
}
