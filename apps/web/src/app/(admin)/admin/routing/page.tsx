import { RoutingFormsSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { Suspense } from "react";
import { PlusIcon, SplitIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { SubmitButton } from "@/components/submit-button";
import { listRoutingForms } from "@/server/routing";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { createRoutingForm } from "./actions";
import { AvailabilityHeader } from "../availability/header";

export const metadata = { title: "Routing" };

async function RoutingListPage() {
  const [, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const forms = await listRoutingForms(ws.id);
  return (
    <div className="space-y-6">
      <AvailabilityHeader
        current="routing"
        routing
        actions={
          <form action={createRoutingForm}>
            <SubmitButton variant="ink">
              <PlusIcon data-icon="inline-start" />
              New routing form
            </SubmitButton>
          </form>
        }
      />
      <p className="max-w-2xl text-sm text-muted-foreground">
        Ask a few questions, then send people to the right event type, link or message.
      </p>
      {forms.length ? (
        <ul className="divide-y rounded-xl border bg-card">
          {forms.map((f) => (
            <li key={f.id} className="flex items-center gap-4 px-4 py-3 text-sm sm:px-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-(--brand)">
                <SplitIcon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/routing/${f.id}`} className="font-medium hover:underline">
                  {f.name}
                </Link>
                <p className="truncate text-muted-foreground">
                  /r/{f.slug} · {f.questions.length} question{f.questions.length === 1 ? "" : "s"}{" "}
                  · {f.rules.length} rule{f.rules.length === 1 ? "" : "s"}
                </p>
              </div>
              <StatusChip tone={f.active ? "success" : "neutral"} dot>
                {f.active ? "Live" : "Off"}
              </StatusChip>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={SplitIcon}
          title="No routing forms yet."
          description="Ask a question or two before people book, and route each answer to the right place."
        />
      )}
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
