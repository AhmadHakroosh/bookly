import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BetaBadge } from "@/components/beta-badge";
import { StepRail } from "@/components/hiring/step-rail";
import { TemplatePicker } from "@/components/hiring/template-picker";
import { OpportunitySetupSkeleton } from "@/components/skeletons/pages";
import { PageHeader } from "@/components/ui/page-header";
import { copySources, mayCreateOpportunity } from "@/server/hiring/setup";
import { opportunityStatus } from "@/server/hiring/setup-text";
import { TEMPLATE_IDS, TEMPLATES } from "@/server/hiring/templates";
import { hiringContext } from "../../context";

export const metadata = { title: "Create opportunity" };

/** S1 Start: choose a template or copy a previous opportunity (opportunity-setup.md). */
async function NewOpportunityPage() {
  const c = await hiringContext();
  if (!c) redirect("/admin");
  const { ws, actor, beta } = c;
  if (!mayCreateOpportunity(actor))
    return (
      <PageHeader
        title="Create opportunity"
        description="Only coordinators can create opportunities. Ask a workspace owner or admin."
      />
    );
  const sources = await copySources(actor);
  const fmt = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: ws.timezone }).format(d)
      : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Create opportunity"
        badge={beta && <BetaBadge />}
        description="Start from a template and change anything. Templates set up stages, questions, reviews and messages."
      />
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <StepRail current="start" />
        <section aria-labelledby="start-title" className="min-w-0 space-y-4">
          <h2 id="start-title" className="text-lg font-semibold">
            How do you select people?
          </h2>
          <TemplatePicker
            templates={TEMPLATE_IDS.map((id) => ({
              id,
              name: TEMPLATES[id].name,
              purpose: TEMPLATES[id].purpose,
              stages: TEMPLATES[id].stages.map((s) => ({ name: s.name, category: s.category })),
            }))}
            sources={sources.map((s) => ({
              id: s.id,
              title: s.title,
              cohort: s.cohort || null,
              status: opportunityStatus(s.status, null).label,
              closes: s.status === "closed" || s.status === "archived" ? fmt(s.closesAt) : null,
            }))}
          />
        </section>
      </div>
    </div>
  );
}

export default function NewOpportunityPageBoundary() {
  return (
    <Suspense fallback={<OpportunitySetupSkeleton />}>
      <NewOpportunityPage />
    </Suspense>
  );
}
