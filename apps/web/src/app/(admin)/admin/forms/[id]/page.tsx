import { EventTypeEditorSkeleton } from "@/components/skeletons/pages";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BetaBadge } from "@/components/beta-badge";
import { BackLink } from "@/components/links";
import { hasFlag, inBeta } from "@/server/flags";
import { formForBuilder, mayEditForm } from "@/server/forms";
import { isManager, requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { FormBuilder } from "./builder";

export const metadata = { title: "Questions" };

async function FormBuilderPage({ params }: PageProps<"/admin/forms/[id]">) {
  const [{ id }, { session, role }, ws] = await Promise.all([
    params,
    requireStaff(),
    getCurrentWorkspace(),
  ]);
  if (!ws || !(await hasFlag(ws, "forms_v2"))) notFound();
  const data = await formForBuilder(ws.id, id);
  if (!data || !mayEditForm(data.owner, { id: session.user.id, manager: isManager(role) }))
    notFound();
  const beta = await inBeta(ws, "forms_v2");
  const { owner } = data;
  const back =
    owner.type === "event_type"
      ? { href: `/admin/event-types/${owner.id}`, label: owner.label }
      : owner.type === "routing_form"
        ? { href: `/admin/routing/${owner.id}`, label: owner.label }
        : { href: "/admin", label: "Home" };
  return (
    <div className="space-y-6">
      <div>
        <BackLink href={back.href}>{back.label}</BackLink>
        <div className="mt-3 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {owner.type === "routing_form" ? "Routing questions" : "Booking questions"}
          </h1>
          {beta && <BetaBadge />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {owner.type === "routing_form"
            ? "What people answer before they are sent on. Routing rules can use every question."
            : "What people answer when they book, after their name and email."}{" "}
          Show a question only when an earlier answer calls for it, ask for files or consent, and
          split long forms into pages. Answers keep the version of the form they were given to.
        </p>
      </div>
      <FormBuilder
        formId={data.form.id}
        initial={data.working}
        published={data.published}
        version={data.version}
        hasDraft={!!data.form.draft}
      />
    </div>
  );
}

export default function FormBuilderPageBoundary(props: PageProps<"/admin/forms/[id]">) {
  return (
    <Suspense fallback={<EventTypeEditorSkeleton />}>
      <FormBuilderPage {...props} />
    </Suspense>
  );
}
