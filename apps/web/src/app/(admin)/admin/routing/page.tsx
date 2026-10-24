import { RoutingFormsSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { listRoutingForms } from "@/server/routing";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { createRoutingForm } from "./actions";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Routing forms" };

async function RoutingListPage() {
  const [, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const forms = await listRoutingForms(ws.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Routing forms"
        description={
          <>Ask a few questions, then send people to the right event type, link or message.</>
        }
        actions={
          <form action={createRoutingForm}>
            <SubmitButton>New form</SubmitButton>
          </form>
        }
      />
      <ul className="space-y-2">
        {forms.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-xl border p-4 text-sm"
          >
            <div>
              <Link href={`/admin/routing/${f.id}`} className="font-medium hover:underline">
                {f.name}
              </Link>
              <p className="text-muted-foreground">
                /r/{f.slug} · {f.questions.length} questions · {f.rules.length} rules
              </p>
            </div>
            <Badge variant={f.active ? "default" : "secondary"}>{f.active ? "Live" : "Off"}</Badge>
          </li>
        ))}
        {forms.length === 0 && (
          <li className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            No routing forms yet.
          </li>
        )}
      </ul>
    </div>
  );
}

export default function RoutingListPageBoundary() {
  return (
    <Suspense fallback={<RoutingFormsSkeleton />}>
      <RoutingListPage />
    </Suspense>
  );
}
