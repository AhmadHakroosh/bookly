"use client";

import { useState, useTransition } from "react";
import { CopyIcon } from "lucide-react";
import type { StageCategory } from "@bookly/db/schema";
import {
  copyOpportunityAction,
  createOpportunityAction,
} from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StageChip } from "./stage-chip";

export type TemplateCard = {
  id: string;
  name: string;
  purpose: string;
  stages: { name: string; category: StageCategory }[];
};

export type CopySource = {
  id: string;
  title: string;
  cohort: string | null;
  status: string;
  closes: string | null;
};

/**
 * S1 Start: "How do you select people?" A card per template with its stage chips, and above
 * them, when the workspace has run one before, "Copy a previous opportunity".
 */
export function TemplatePicker({
  templates,
  sources,
}: {
  templates: TemplateCard[];
  sources: CopySource[];
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [team, setTeam] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState(sources[0]?.id ?? "");
  const run = (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    start(async () => {
      await fn();
    });
  };
  const copy = (id: string) => run(`copy:${id}`, () => copyOpportunityAction(id, team));
  const recent = sources[0];
  return (
    <div className="space-y-4" aria-busy={pending}>
      {recent && (
        <section
          aria-labelledby="copy-title"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
        >
          <div className="min-w-0 space-y-1">
            <h2 id="copy-title" className="flex items-center gap-2 font-semibold">
              <CopyIcon className="size-4 text-muted-foreground" aria-hidden />
              Copy a previous opportunity
            </h2>
            <p className="text-sm text-muted-foreground">
              Start the next cycle with the same stages, questions, reviews and messages.
              Applications are never copied.
            </p>
            <label className="flex items-start gap-2 pt-1 text-sm">
              <Checkbox checked={team} onCheckedChange={(v) => setTeam(!!v)} className="mt-0.5" />
              <span>
                Also copy the team
                <span className="block text-xs text-muted-foreground">
                  Invitations go out again when you publish.
                </span>
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ink" disabled={pending} onClick={() => copy(recent.id)}>
              {busy === `copy:${recent.id}` && pending && <Spinner data-icon="inline-start" />}
              Copy {recent.title}
            </Button>
            {sources.length > 1 && (
              <Button variant="outline" disabled={pending} onClick={() => setChoosing(true)}>
                Choose another
              </Button>
            )}
          </div>
        </section>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-col rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{t.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.purpose}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${t.name} stages`}>
              {t.stages.map((s) => (
                <li key={s.name}>
                  <StageChip name={s.name} category={s.category} />
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-4">
              <Button
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={() => run(t.id, () => createOpportunityAction(t.id))}
                aria-label={t.id === "blank" ? "Start blank" : `Use the ${t.name} template`}
              >
                {busy === t.id && pending && <Spinner data-icon="inline-start" />}
                {t.id === "blank" ? "Start blank" : "Use template"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Jobs, gigs, volunteer and grant templates are coming. You can model any of them from a blank
        start today.
      </p>
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy a previous opportunity</DialogTitle>
            <DialogDescription>
              The copy keeps the stages, questions, reviews and messages. Dates are cleared.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="max-h-80 space-y-1 overflow-y-auto">
            <legend className="sr-only">Opportunity to copy</legend>
            {sources.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-accent"
              >
                <input
                  type="radio"
                  name="source"
                  value={s.id}
                  checked={picked === s.id}
                  onChange={() => setPicked(s.id)}
                  className="mt-1 accent-primary"
                />
                <span className="min-w-0 text-sm">
                  <span className="block font-medium">{s.title}</span>
                  <span className="text-muted-foreground">
                    {[s.cohort, s.status, s.closes && `closed ${s.closes}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={team} onCheckedChange={(v) => setTeam(!!v)} />
            Also copy the team
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
            <Button variant="ink" disabled={!picked || pending} onClick={() => copy(picked)}>
              {pending && <Spinner data-icon="inline-start" />}
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
