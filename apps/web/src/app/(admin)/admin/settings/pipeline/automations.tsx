"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, ZapIcon } from "lucide-react";
import type { EditorAction, EditorRule } from "@/server/pipelines/editor-text";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteRuleAction, saveRuleAction, toggleRuleAction, type RuleSaveState } from "./actions";

/*
 * A stage's automations (ADR 0002): "when someone enters (or leaves) this stage, after a wait,
 * for people with a tag: do these things in order". Each action is edited where it is, and the
 * server keeps the emails, checklist, booking links and payment as the stage's module config.
 */

type Option = { value: string; label: string };
export type AutomationRow = {
  id: string;
  active: boolean;
  editor: EditorRule;
  summary: string[];
  runs: Record<string, number>;
};
type Options = { stages: Option[]; eventTypes: Option[]; forms: Option[] };

const KINDS: { value: EditorAction["kind"]; label: string }[] = [
  { value: "email", label: "Send an email" },
  { value: "tasks", label: "Create tasks" },
  { value: "booking_link", label: "Send a booking link" },
  { value: "form", label: "Ask to fill in a form" },
  { value: "payment", label: "Request a payment" },
  { value: "move", label: "Move to another stage" },
  { value: "tag", label: "Add a tag" },
  { value: "notify", label: "Tell owners and admins" },
];

const textarea =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2";

function blank(kind: EditorAction["kind"], o: Options): EditorAction {
  switch (kind) {
    case "email":
      return { kind, subject: "", body: "", transactional: false };
    case "tasks":
      return { kind, items: [] };
    case "booking_link":
      return { kind, eventTypeId: o.eventTypes[0]?.value ?? "" };
    case "form":
      return { kind, formId: o.forms[0]?.value ?? "" };
    case "payment":
      return { kind, amount: 0, currency: "usd", description: "" };
    case "move":
      return { kind, stageKey: o.stages[0]?.value ?? "" };
    case "tag":
      return { kind, tag: "" };
    case "notify":
      return { kind, text: "" };
  }
}

const when = (r: EditorRule) =>
  [
    r.on === "enter" ? "When someone enters" : "When someone leaves",
    r.delayHours ? `after ${r.delayHours} h` : null,
    r.tag ? `tagged "${r.tag}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const runsText = (runs: Record<string, number>) => {
  const done = runs.done ?? 0;
  const parts = [`Ran ${done} time${done === 1 ? "" : "s"}`];
  if (runs.failed) parts.push(`${runs.failed} failed`);
  if (runs.pending) parts.push(`${runs.pending} waiting`);
  return parts.join(" · ");
};

export function StageAutomations({
  stageId,
  stageName,
  stageKey,
  rules,
  options,
}: {
  stageId: string;
  stageName: string;
  stageKey: string;
  rules: AutomationRow[];
  options: Options;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const others = { ...options, stages: options.stages.filter((s) => s.value !== stageKey) };
  return (
    <section aria-label={`Automations for ${stageName}`} className="space-y-2 border-t pt-3">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <ZapIcon className="size-4 text-muted-foreground" aria-hidden /> Automations
      </h3>
      {rules.length > 0 && (
        <ul className="space-y-2">
          {rules.map((r) =>
            editing === r.id ? (
              <li key={r.id}>
                <RuleForm
                  stageId={stageId}
                  ruleId={r.id}
                  initial={r.editor}
                  options={others}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.editor.name}
                      {!r.active && (
                        <span className="font-normal text-muted-foreground"> (off)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{when(r.editor)}</p>
                    <ul className="mt-1 list-disc ps-5 text-xs">
                      {r.summary.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted-foreground">{runsText(r.runs)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(r.id)}
                      aria-label={`Edit ${r.editor.name}`}
                    >
                      Edit
                    </Button>
                    <form action={toggleRuleAction.bind(null, r.id, !r.active)}>
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        aria-label={`${r.active ? "Turn off" : "Turn on"} ${r.editor.name}`}
                      >
                        {r.active ? "Turn off" : "Turn on"}
                      </SubmitButton>
                    </form>
                    <form action={deleteRuleAction.bind(null, r.id)}>
                      <SubmitButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${r.editor.name}`}
                      >
                        <Trash2Icon />
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {editing === "new" ? (
        <RuleForm
          stageId={stageId}
          ruleId={null}
          initial={{ name: "", on: "enter", delayHours: 0, tag: "", actions: [] }}
          options={others}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing("new")}
          aria-label={`Add an automation to ${stageName}`}
        >
          <PlusIcon /> Add automation
        </Button>
      )}
    </section>
  );
}

function RuleForm({
  stageId,
  ruleId,
  initial,
  options,
  onDone,
}: {
  stageId: string;
  ruleId: string | null;
  initial: EditorRule;
  options: Options;
  onDone: () => void;
}) {
  const [rule, setRule] = useState<EditorRule>(initial);
  const [adding, setAdding] = useState<EditorAction["kind"]>("email");
  const [state, action] = useActionState(
    saveRuleAction.bind(null, stageId, ruleId),
    {} as RuleSaveState,
  );
  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);
  const set = (patch: Partial<EditorRule>) => setRule((r) => ({ ...r, ...patch }));
  const setAction = (i: number, a: EditorAction) =>
    set({ actions: rule.actions.map((x, j) => (j === i ? a : x)) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...rule.actions];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    set({ actions: next });
  };

  return (
    <form action={action} className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
      <input type="hidden" name="rule" value={JSON.stringify(rule)} />
      <Input
        value={rule.name}
        onChange={(e) => set({ name: e.target.value })}
        aria-label="Automation name"
        placeholder="Name, e.g. Welcome new clients"
        maxLength={120}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          value={rule.on}
          onValueChange={(v) => set({ on: v as EditorRule["on"] })}
          ariaLabel="When it runs"
          className="h-9 w-52"
          options={[
            { value: "enter", label: "When someone enters" },
            { value: "leave", label: "When someone leaves" },
          ]}
        />
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">after</span>
          <Input
            type="number"
            min={0}
            max={168}
            value={rule.delayHours}
            onChange={(e) =>
              set({ delayHours: Math.max(0, Math.min(168, Number(e.target.value) || 0)) })
            }
            aria-label="Hours to wait"
            className="h-9 w-20"
          />
          <span className="text-muted-foreground">hours</span>
        </label>
        <Input
          value={rule.tag}
          onChange={(e) => set({ tag: e.target.value })}
          aria-label="Only for contacts tagged"
          placeholder="Only for a tag (optional)"
          className="h-9 w-48"
          maxLength={40}
        />
      </div>

      <ol className="space-y-2">
        {rule.actions.map((a, i) => (
          <li key={i} className="space-y-2 rounded-lg border bg-background p-3">
            <div className="flex items-center gap-1">
              <span className="me-auto text-xs font-medium">
                {i + 1}. {KINDS.find((k) => k.value === a.kind)?.label}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move action ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move action ${i + 1} down`}
                disabled={i === rule.actions.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove action ${i + 1}`}
                onClick={() => set({ actions: rule.actions.filter((_, j) => j !== i) })}
              >
                <Trash2Icon />
              </Button>
            </div>
            <ActionFields
              action={a}
              n={i + 1}
              options={options}
              onChange={(x) => setAction(i, x)}
            />
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          value={adding}
          onValueChange={(v) => setAdding(v as EditorAction["kind"])}
          ariaLabel="Action to add"
          className="h-9 w-56"
          options={KINDS.filter(
            (k) =>
              (k.value !== "booking_link" || options.eventTypes.length) &&
              (k.value !== "form" || options.forms.length) &&
              (k.value !== "move" || options.stages.length),
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set({ actions: [...rule.actions, blank(adding, options)] })}
        >
          <PlusIcon /> Add action
        </Button>
      </div>

      {state.problems?.length ? (
        <ul
          role="alert"
          className="list-disc space-y-0.5 rounded-lg border border-destructive/40 p-3 ps-7 text-destructive"
        >
          {state.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton size="sm">Save automation</SubmitButton>
      </div>
    </form>
  );
}

function ActionFields({
  action: a,
  n,
  options,
  onChange,
}: {
  action: EditorAction;
  n: number;
  options: Options;
  onChange: (a: EditorAction) => void;
}) {
  const label = (what: string) => `Action ${n}: ${what}`;
  switch (a.kind) {
    case "email":
      return (
        <div className="space-y-2">
          <Input
            value={a.subject}
            onChange={(e) => onChange({ ...a, subject: e.target.value })}
            aria-label={label("subject")}
            placeholder="Subject"
            maxLength={200}
          />
          <textarea
            value={a.body}
            onChange={(e) => onChange({ ...a, body: e.target.value })}
            aria-label={label("message")}
            placeholder="Hi {name}, …"
            rows={4}
            maxLength={8000}
            className={textarea}
          />
          <p className="text-xs text-muted-foreground">
            Placeholders: {"{name}"}, {"{company}"}, {"{stage}"}, {"{host}"}. Sent from you, in the
            contact&apos;s conversation, so replies land in Messages.
          </p>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={a.transactional}
              onChange={(e) => onChange({ ...a, transactional: e.target.checked })}
              className="mt-0.5"
            />
            Status, scheduling or payment news: send it even to people who unsubscribed from your
            emails
          </label>
        </div>
      );
    case "tasks":
      return (
        <div className="space-y-2">
          <textarea
            defaultValue={a.items.map((i) => i.title).join("\n")}
            onChange={(e) =>
              onChange({
                ...a,
                items: e.target.value
                  .split("\n")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 30)
                  .map((title) => ({ title, dueDays: a.items[0]?.dueDays ?? null })),
              })
            }
            aria-label={label("tasks, one per line")}
            placeholder="One task per line"
            rows={3}
            className={textarea}
          />
          <label className="flex items-center gap-2 text-xs">
            Due after
            <Input
              type="number"
              min={0}
              max={365}
              value={a.items[0]?.dueDays ?? ""}
              onChange={(e) => {
                const d =
                  e.target.value === "" ? null : Math.max(0, Math.min(365, Number(e.target.value)));
                onChange({ ...a, items: a.items.map((i) => ({ ...i, dueDays: d })) });
              }}
              aria-label={label("days until the tasks are due")}
              className="h-8 w-20"
            />
            days (optional). The checklist belongs to the stage: every automation here that creates
            tasks uses this list.
          </label>
        </div>
      );
    case "booking_link":
      return (
        <Dropdown
          value={a.eventTypeId || undefined}
          onValueChange={(v) => onChange({ ...a, eventTypeId: v })}
          ariaLabel={label("event type to book")}
          className="h-9 w-72"
          options={options.eventTypes}
        />
      );
    case "form":
      return (
        <Dropdown
          value={a.formId || undefined}
          onValueChange={(v) => onChange({ ...a, formId: v })}
          ariaLabel={label("form to fill in")}
          className="h-9 w-72"
          options={options.forms}
        />
      );
    case "payment":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={0.5}
            step={0.01}
            value={a.amount || ""}
            onChange={(e) => onChange({ ...a, amount: Number(e.target.value) || 0 })}
            aria-label={label("amount")}
            placeholder="Amount"
            className="h-9 w-32"
          />
          <Input
            value={a.currency}
            onChange={(e) => onChange({ ...a, currency: e.target.value.slice(0, 3) })}
            aria-label={label("currency")}
            className="h-9 w-20 uppercase"
            maxLength={3}
          />
          <Input
            value={a.description}
            onChange={(e) => onChange({ ...a, description: e.target.value })}
            aria-label={label("what it is for")}
            placeholder="What it is for"
            className="h-9 min-w-0 flex-1 basis-48"
            maxLength={200}
          />
        </div>
      );
    case "move":
      return (
        <Dropdown
          value={a.stageKey || undefined}
          onValueChange={(v) => onChange({ ...a, stageKey: v })}
          ariaLabel={label("stage to move to")}
          className="h-9 w-60"
          options={options.stages}
        />
      );
    case "tag":
      return (
        <Input
          value={a.tag}
          onChange={(e) => onChange({ ...a, tag: e.target.value })}
          aria-label={label("tag")}
          placeholder="Tag"
          className="h-9 w-48"
          maxLength={40}
        />
      );
    case "notify":
      return (
        <Input
          value={a.text}
          onChange={(e) => onChange({ ...a, text: e.target.value })}
          aria-label={label("what to tell the team")}
          placeholder="{name} is ready for onboarding"
          maxLength={500}
        />
      );
  }
}
