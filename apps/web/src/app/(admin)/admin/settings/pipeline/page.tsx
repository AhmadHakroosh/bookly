import { SettingsSkeleton } from "@/components/skeletons/pages";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { STAGE_CATEGORIES } from "@bookly/db/schema";
import { BetaBadge } from "@/components/beta-badge";
import { ColorPicker } from "@/components/color-picker";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { hasFlag, inBeta } from "@/server/flags";
import { clientStages, stageCounts } from "@/server/pipelines";
import { describeAction, toEditor } from "@/server/pipelines/editor-text";
import { readModules } from "@/server/pipelines/modules";
import { stageRulesOf } from "@/server/pipelines/rules";
import { listRoutingForms } from "@/server/routing";
import { listAllEventTypes } from "@/server/scheduling";
import { StageAutomations, type AutomationRow } from "./automations";
import { requireManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { addStageAction, archiveStageAction, moveStageAction, saveStageAction } from "./actions";

export const metadata = { title: "Pipeline" };

const CATEGORY_LABEL = { open: "Open", hold: "On hold", won: "Won", lost: "Lost" } as const;
const categories = STAGE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

async function PipelinePage({ searchParams }: PageProps<"/admin/settings/pipeline">) {
  const [, ws, sp] = await Promise.all([requireManager(), getCurrentWorkspace(), searchParams]);
  if (!ws || !(await hasFlag(ws, "pipelines"))) notFound();
  const [stages, counts, beta, automationsOn] = await Promise.all([
    clientStages(ws.id),
    stageCounts(ws.id),
    inBeta(ws, "pipelines"),
    hasFlag(ws, "stage_rules"),
  ]);
  const automations = automationsOn ? await automationsFor(ws.id, stages) : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          The stages every contact moves through. Rename and reorder them, add your own, and choose
          which ones get priority scheduling. Reports and automations read a stage&apos;s category,
          so renaming never breaks them.
        </p>
        {beta && <BetaBadge />}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <ol className="space-y-3">
        {stages.map((s, i) => {
          const n = counts.get(s.id) ?? 0;
          return (
            <li key={s.id} className="space-y-3 rounded-xl border p-4">
              <form action={saveStageAction.bind(null, s.id)} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    name="name"
                    defaultValue={s.name}
                    aria-label="Stage name"
                    className="min-w-0 flex-1 basis-48"
                    maxLength={60}
                    required
                  />
                  <Dropdown
                    name="category"
                    defaultValue={s.category}
                    ariaLabel="Category"
                    className="w-36"
                    options={categories}
                  />
                  <ColorPicker name="color" defaultValue={s.color} ariaLabel="Colour" required />
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="priority"
                      defaultChecked={!!s.settings.priorityScheduling}
                    />
                    Priority scheduling
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="entry"
                      defaultChecked={s.isEntry}
                      disabled={s.isEntry}
                    />
                    New contacts start here
                  </label>
                  <span className="text-muted-foreground">
                    {n} {n === 1 ? "contact" : "contacts"} · key{" "}
                    <code className="font-mono text-xs">{s.key}</code>
                  </span>
                  <SubmitButton size="sm" variant="outline" className="ms-auto">
                    Save
                  </SubmitButton>
                </div>
              </form>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <form action={moveStageAction.bind(null, s.id, "up")}>
                  <SubmitButton
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${s.name} up`}
                    disabled={i === 0}
                  >
                    <ArrowUpIcon />
                  </SubmitButton>
                </form>
                <form action={moveStageAction.bind(null, s.id, "down")}>
                  <SubmitButton
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${s.name} down`}
                    disabled={i === stages.length - 1}
                  >
                    <ArrowDownIcon />
                  </SubmitButton>
                </form>
                {!s.isEntry && (
                  <form
                    action={archiveStageAction.bind(null, s.id)}
                    className="ms-auto flex items-center gap-2"
                  >
                    {n > 0 && (
                      <Dropdown
                        name="moveTo"
                        ariaLabel={`Move the people in ${s.name} to`}
                        placeholder="Move people to…"
                        className="w-44"
                        size="sm"
                        options={stages
                          .filter((x) => x.id !== s.id)
                          .map((x) => ({ value: x.id, label: x.name }))}
                      />
                    )}
                    <SubmitButton size="sm" variant="destructive">
                      Archive
                    </SubmitButton>
                  </form>
                )}
              </div>
              {automations && (
                <StageAutomations
                  stageId={s.id}
                  stageName={s.name}
                  stageKey={s.key}
                  rules={automations.rows.get(s.id) ?? []}
                  options={automations.options}
                />
              )}
            </li>
          );
        })}
      </ol>
      <form
        action={addStageAction}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-4"
      >
        <Input
          name="name"
          placeholder="New stage, e.g. Proposal sent"
          aria-label="New stage name"
          className="min-w-0 flex-1 basis-48"
          maxLength={60}
          required
        />
        <Dropdown
          name="category"
          defaultValue="open"
          ariaLabel="Category"
          className="w-36"
          options={categories}
        />
        <SubmitButton variant="outline">Add stage</SubmitButton>
      </form>
    </div>
  );
}

/** Every stage's automations as the editor shows them, and what they can point at. */
async function automationsFor(
  workspaceId: string,
  stages: Awaited<ReturnType<typeof clientStages>>,
) {
  const [perStage, eventTypes, routingForms] = await Promise.all([
    Promise.all(stages.map((s) => stageRulesOf(workspaceId, s.id))),
    listAllEventTypes(workspaceId),
    listRoutingForms(workspaceId),
  ]);
  const options = {
    stages: stages.map((s) => ({ value: s.key, label: s.name })),
    eventTypes: eventTypes.filter((e) => e.active).map((e) => ({ value: e.id, label: e.title })),
    forms: routingForms.filter((f) => f.formId).map((f) => ({ value: f.formId!, label: f.name })),
  };
  const names = {
    stages: new Map(options.stages.map((o) => [o.value, o.label])),
    eventTypes: new Map(options.eventTypes.map((o) => [o.value, o.label])),
    forms: new Map(options.forms.map((o) => [o.value, o.label])),
  };
  const rows = new Map<string, AutomationRow[]>();
  stages.forEach((stage, i) => {
    const { modules } = readModules(stage.modules);
    rows.set(
      stage.id,
      perStage[i]!.map((r) => {
        const editor = toEditor(r, modules);
        return {
          id: r.id,
          active: r.active,
          editor,
          summary: editor.actions.map((a) => describeAction(a, names)),
          runs: r.runs,
        };
      }),
    );
  });
  return { rows, options };
}

export default function PipelinePageBoundary(props: PageProps<"/admin/settings/pipeline">) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <PipelinePage {...props} />
    </Suspense>
  );
}
