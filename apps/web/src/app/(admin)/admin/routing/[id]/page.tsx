import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRoutingFormById } from "@/server/routing";
import { listAllEventTypes, listProfiles } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { RoutingFormEditor } from "./editor";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Edit routing form" };

async function EditRoutingPage({ params }: PageProps<"/admin/routing/[id]">) {
  const [{ id }, , ws] = await Promise.all([params, requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const form = await getRoutingFormById(ws.id, id);
  if (!form) notFound();
  const [eventTypes, profiles] = await Promise.all([listAllEventTypes(ws.id), listProfiles(ws.id)]);
  const names = new Map(profiles.map((p) => [p.userId, p.displayName]));
  return (
    <RoutingFormEditor
      form={form}
      eventTypes={eventTypes
        .filter((e) => e.active)
        .map((e) => ({ id: e.id, label: `${e.title} · ${names.get(e.userId) ?? ""}` }))}
    />
  );
}

export default function EditRoutingPageBoundary(props: PageProps<"/admin/routing/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl">
          <PageSkeleton />
        </div>
      }
    >
      <EditRoutingPage {...props} />
    </Suspense>
  );
}
