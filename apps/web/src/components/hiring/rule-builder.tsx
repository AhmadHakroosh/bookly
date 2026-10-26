"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { RuleAction } from "@bookly/db/schema";
import { deleteRuleAction, saveRuleAction } from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Dropdown } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { isFinal, MODULE_LABEL, type SetupRule } from "@/server/hiring/setup-text";
import { moduleOfAction, type ModuleKind } from "@/server/pipelines/modules";
import { useSave, type PanelData } from "./module-panels";

/*
 * S5: rules as sentences a screen reader can read aloud. "When an application enters this stage,
 * if it has the track engineering, do: assign reviewers." Actions come only from modules switched
 * on for the stage; the ones that would decide for a person are never offered.
 */

type Kind = RuleAction["type"];

const ACTION_LABELS: Partial<Record<Kind, string>> = {
  send_message: "send an email",
  send_booking_link: "send the booking link",
  request_form: "ask for a form",
  assign_reviewers: "assign reviewers",
  create_tasks: "create the checklist",
  request_payment: "request the payment",
  create_folder: "create the shared folder",
  route: "run routing",
  notify_team: "tell the team",
  add_tag: "add a tag",
  move_to_stage: "move to another open stage",
};

const OFFERED: Kind[] = [
  "send_message",
  "send_booking_link",
  "request_form",
  "assign_reviewers",
  "create_tasks",
  "request_payment",
  "create_folder",
  "route",
  "notify_team",
  "add_tag",
  "move_to_stage",
];

const MODULE_HINT: Partial<Record<ModuleKind, string>> = {
  scheduling: "Switch on Scheduling to send a booking link",
  messages: "Switch on Messages to send an email",
  forms: "Switch on Forms to ask for a form",
  reviews: "Switch on Reviews to assign reviewers",
  tasks: "Switch on Tasks to create a checklist",
  payments: "Switch on Payments to request a payment",
  files: "Switch on Files to create a folder",
  routing: "Switch on Routing to route",
};

/** The actions a stage offers: enabled ones, and the ones a module would unlock (greyed). */
function actionOptions(data: PanelData) {
  const { stage, stages } = data;
  const final = isFinal(stage.category);
  const opens = stages.filter((s) => s.category === "open" && s.key !== stage.key);
  return OFFERED.flatMap((k) => {
    // Outcomes' emails wait for decision release; moves only go to open stages.
    if (final && k === "send_message") return [];
    if (k === "move_to_stage" && !opens.length) return [];
    const m = moduleOfAction(k);
    const on = !m || (!!stage.modules[m] && stage.modules[m]?.enabled !== false);
    return [
      {
        value: k,
        label: on
          ? ACTION_LABELS[k]!
          : `${ACTION_LABELS[k]} (${MODULE_HINT[m!] ?? `Switch on ${MODULE_LABEL(m!)}`})`,
        disabled: !on,
      },
    ];
  });
}

function blank(k: Kind, data: PanelData): RuleAction {
  const { stage, stages } = data;
  switch (k) {
    case "send_message":
      return { type: k, templateId: stage.modules.messages?.templates[0]?.id ?? "" };
    case "send_booking_link":
      return { type: k, sessionIndex: 0 };
    case "request_form":
      return { type: k, formId: stage.modules.forms?.forms[0]?.formId ?? "" };
    case "notify_team":
      return { type: k, who: "coordinators", text: "" };
    case "add_tag":
      return { type: k, tag: "" };
    case "move_to_stage":
      return {
        type: k,
        stageKey: stages.find((s) => s.category === "open" && s.key !== stage.key)?.key ?? "",
      };
    default:
      return { type: k } as RuleAction;
  }
}

/** "send an email “We received your application”", for a saved rule's sentence. */
function describe(a: RuleAction, data: PanelData) {
  switch (a.type) {
    case "send_message":
      return `send “${data.stage.modules.messages?.templates.find((t) => t.id === a.templateId)?.subject ?? "a missing email"}”`;
    case "send_booking_link": {
      const id = data.stage.modules.scheduling?.sessions[a.sessionIndex]?.eventTypeId;
      return `send the link to book ${data.eventTypes.find((e) => e.value === id)?.label ?? "an interview"}`;
    }
    case "request_form":
      return `ask for ${data.forms.find((f) => f.id === a.formId)?.name ?? "a form"}`;
    case "notify_team":
      return `tell ${a.who === "assigned_reviewers" ? "the assigned reviewers" : "the coordinators"}: ${a.text}`;
    case "add_tag":
      return `add the tag “${a.tag}”`;
    case "move_to_stage":
      return `move to ${data.stages.find((s) => s.key === a.stageKey)?.name ?? "a removed stage"}`;
    default:
      return ACTION_LABELS[a.type] ?? a.type;
  }
}

const tagOf = (r: SetupRule) => {
  const c = r.conditions?.conditions.find((x) => x.fieldId === "tags");
  return typeof c?.value === "string" ? c.value : "";
};

export function RuleBuilder({ data }: { data: PanelData }) {
  const { stage } = data;
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const rules = stage.rules;
  return (
    <section aria-labelledby={`rules-${stage.key}`} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`rules-${stage.key}`} className="text-sm font-semibold">
          Rules
        </h3>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer underline-offset-2 hover:underline">
            Why can&apos;t rules decide?
          </summary>
          <p className="mt-1 max-w-sm">
            People decide outcomes in Bookly. Rules can prepare, notify and schedule, but only a
            person can admit, waitlist or turn down an applicant.
          </p>
        </details>
      </div>
      {!rules.length && editing !== "new" && (
        <p className="text-sm text-muted-foreground">
          No rules yet. Rules send messages, links and checklists automatically when applications
          move.
        </p>
      )}
      <ul className="space-y-2">
        {rules.map((r) =>
          editing === r.id ? (
            <li key={r.id}>
              <RuleForm data={data} rule={r} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <RuleSentence rule={r} data={data} />
              {!data.readOnly && (
                <div className="flex shrink-0 gap-1">
                  {isMessageRule(r) ? (
                    <span className="px-2 py-1 text-xs text-muted-foreground">In Messages</span>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r.id!)}>
                        Edit
                      </Button>
                      <DeleteRule data={data} rule={r} />
                    </>
                  )}
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <RuleForm data={data} onDone={() => setEditing(null)} />
      ) : (
        !data.readOnly && (
          <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            Add rule
          </Button>
        )
      )}
    </section>
  );
}

const isMessageRule = (r: SetupRule) =>
  r.actions.length === 1 && r.actions[0]!.type === "send_message";

function RuleSentence({ rule, data }: { rule: SetupRule; data: PanelData }) {
  const tag = tagOf(rule);
  const off = rule.actions
    .map((a) => moduleOfAction(a.type))
    .find((m) => m && (!data.stage.modules[m] || data.stage.modules[m]?.enabled === false));
  return (
    <div className="min-w-0">
      <p className={off ? "line-through decoration-muted-foreground" : undefined}>
        <span className="font-medium">When</span> an application{" "}
        {rule.trigger.on === "leave" ? "leaves" : "enters"} this stage
        {tag && (
          <>
            , <span className="font-medium">if</span> it has the tag “{tag}”
          </>
        )}
        , <span className="font-medium">do</span>:{" "}
        {rule.actions
          .map((a) => describe(a, data))
          .join(", then ")
          .replace(/[.!?]?$/, ".")}
      </p>
      {off && (
        <p className="text-xs text-destructive">
          {MODULE_LABEL(off)} is off for this stage. Turn it on or remove this rule.
        </p>
      )}
      {!rule.active && <p className="text-xs text-muted-foreground">Off</p>}
    </div>
  );
}

function DeleteRule({ data, rule }: { data: PanelData; rule: SetupRule }) {
  const save = useSave();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Delete the rule ${rule.name}`}
      disabled={save.pending}
      onClick={() => save.run(() => deleteRuleAction(data.oppId, rule.id!))}
    >
      {save.pending ? <Spinner /> : <Trash2Icon />}
    </Button>
  );
}

function RuleForm({
  data,
  rule,
  onDone,
}: {
  data: PanelData;
  rule?: SetupRule;
  onDone: () => void;
}) {
  const options = actionOptions(data);
  const firstOn = options.find((o) => !o.disabled)?.value as Kind | undefined;
  const [on, setOn] = useState<"enter" | "leave">(rule?.trigger.on === "leave" ? "leave" : "enter");
  const [tag, setTag] = useState(rule ? tagOf(rule) : "");
  const [actions, setActions] = useState<RuleAction[]>(
    rule?.actions ?? (firstOn ? [blank(firstOn, data)] : []),
  );
  const save = useSave();
  const set = (i: number, a: RuleAction) => setActions(actions.map((x, j) => (j === i ? a : x)));
  const opens = data.stages.filter((s) => s.category === "open" && s.key !== data.stage.key);
  return (
    <fieldset className="space-y-3 rounded-lg border p-3 text-sm">
      <legend className="sr-only">{rule ? `Edit rule ${rule.name}` : "New rule"}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">When</span>
        <Dropdown
          ariaLabel="When"
          size="sm"
          value={on}
          options={[
            { value: "enter", label: "an application enters this stage" },
            { value: "leave", label: "an application leaves this stage" },
          ]}
          onValueChange={(v) => setOn(v as "enter" | "leave")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">if</span>
        <span>it has the tag or track</span>
        <Input
          aria-label="Only for applications with this tag or track (optional)"
          size="sm"
          className="w-40"
          placeholder="any"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">(optional)</span>
      </div>
      <ol className="space-y-2">
        {actions.map((a, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{i ? "then" : "do"}</span>
            <Dropdown
              ariaLabel={`Action ${i + 1}`}
              size="sm"
              value={a.type}
              options={options}
              onValueChange={(v) => set(i, blank(v as Kind, data))}
            />
            {a.type === "send_message" && (
              <Dropdown
                ariaLabel="Email"
                size="sm"
                value={a.templateId}
                placeholder="Add a message in Messages first"
                options={(data.stage.modules.messages?.templates ?? []).map((t) => ({
                  value: t.id,
                  label: t.subject,
                }))}
                onValueChange={(v) => set(i, { ...a, templateId: v })}
              />
            )}
            {a.type === "send_booking_link" && (
              <Dropdown
                ariaLabel="Booking"
                size="sm"
                value={String(a.sessionIndex)}
                placeholder="Choose an event type in Scheduling"
                options={(data.stage.modules.scheduling?.sessions ?? []).map((s, j) => ({
                  value: String(j),
                  label:
                    data.eventTypes.find((e) => e.value === s.eventTypeId)?.label ??
                    "An event type",
                }))}
                onValueChange={(v) => set(i, { ...a, sessionIndex: Number(v) })}
              />
            )}
            {a.type === "request_form" && (
              <Dropdown
                ariaLabel="Form"
                size="sm"
                value={a.formId}
                placeholder="Add a form in Forms"
                options={(data.stage.modules.forms?.forms ?? []).map((f) => ({
                  value: f.formId,
                  label: data.forms.find((x) => x.id === f.formId)?.name ?? "A form",
                }))}
                onValueChange={(v) => set(i, { ...a, formId: v })}
              />
            )}
            {a.type === "notify_team" && (
              <>
                <Dropdown
                  ariaLabel="Who"
                  size="sm"
                  value={a.who}
                  options={[
                    { value: "coordinators", label: "the coordinators" },
                    { value: "assigned_reviewers", label: "the assigned reviewers" },
                  ]}
                  onValueChange={(v) => set(i, { ...a, who: v as typeof a.who })}
                />
                <Input
                  aria-label="What to tell them"
                  size="sm"
                  className="min-w-48 flex-1"
                  value={a.text}
                  onChange={(e) => set(i, { ...a, text: e.target.value })}
                />
              </>
            )}
            {a.type === "add_tag" && (
              <Input
                aria-label="Tag"
                size="sm"
                className="w-40"
                value={a.tag}
                onChange={(e) => set(i, { ...a, tag: e.target.value })}
              />
            )}
            {a.type === "move_to_stage" && (
              <Dropdown
                ariaLabel="Stage"
                size="sm"
                value={a.stageKey}
                options={opens.map((s) => ({ value: s.key, label: s.name }))}
                onValueChange={(v) => set(i, { ...a, stageKey: v })}
              />
            )}
            {actions.length > 1 && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove action ${i + 1}`}
                onClick={() => setActions(actions.filter((_, j) => j !== i))}
              >
                <Trash2Icon />
              </Button>
            )}
          </li>
        ))}
      </ol>
      {firstOn && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActions([...actions, blank(firstOn, data)])}
        >
          <PlusIcon data-icon="inline-start" />
          Add another action
        </Button>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span role="status" className="mr-auto text-xs text-destructive">
          {save.error}
        </span>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={save.pending || !actions.length}
          onClick={() =>
            save.run(async () => {
              const name =
                rule?.name ??
                `${on === "leave" ? "On leaving" : "On entering"}: ${actions.map((a) => describe(a, data)).join(", ")}`.slice(
                  0,
                  120,
                );
              const r = await saveRuleAction(data.oppId, data.stage.id, rule?.id ?? null, {
                name,
                on,
                tag,
                actions,
              });
              if (!r.problems?.length) onDone();
              return r;
            })
          }
        >
          {save.pending && <Spinner data-icon="inline-start" />}
          Save rule
        </Button>
      </div>
    </fieldset>
  );
}
