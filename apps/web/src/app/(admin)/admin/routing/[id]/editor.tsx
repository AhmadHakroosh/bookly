"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import { BackLink, ExternalLink } from "@/components/links";
import type { RoutingDestination, RoutingForm, RoutingRule } from "@bookly/db/schema";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuestionBuilder } from "../../event-types/[id]/question-builder";
import { deleteRoutingForm, saveRoutingForm, type RoutingSaveState } from "../actions";

type EventTypeOption = { id: string; label: string };
const OPS: [RoutingRule["conditions"][number]["op"], string][] = [
  ["equals", "is"],
  ["not_equals", "is not"],
  ["contains", "contains"],
  ["not_empty", "is answered"],
];

function DestinationPicker({
  value,
  onChange,
  eventTypes,
}: {
  value: RoutingDestination | null;
  onChange: (d: RoutingDestination | null) => void;
  eventTypes: EventTypeOption[];
}) {
  const type = value?.type ?? "event_type";
  const select = "h-8 rounded-lg border bg-background px-2 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={type}
        aria-label="Destination type"
        className={select}
        onChange={(e) => {
          const t = e.target.value;
          onChange(
            t === "url"
              ? { type: "url", url: "" }
              : t === "message"
                ? { type: "message", text: "" }
                : { type: "event_type", eventTypeId: eventTypes[0]?.id ?? "" },
          );
        }}
      >
        <option value="event_type">Book an event type</option>
        <option value="url">Open a link</option>
        <option value="message">Show a message</option>
      </select>
      {(!value || value.type === "event_type") && (
        <select
          value={value?.type === "event_type" ? value.eventTypeId : ""}
          aria-label="Event type"
          className={select}
          onChange={(e) => onChange({ type: "event_type", eventTypeId: e.target.value })}
        >
          {eventTypes.map((et) => (
            <option key={et.id} value={et.id}>
              {et.label}
            </option>
          ))}
        </select>
      )}
      {value?.type === "url" && (
        <Input
          value={value.url}
          placeholder="https://"
          aria-label="Link"
          className="min-w-64"
          onChange={(e) => onChange({ type: "url", url: e.target.value })}
        />
      )}
      {value?.type === "message" && (
        <Input
          value={value.text}
          placeholder="Text shown to the visitor"
          aria-label="Message"
          className="min-w-64"
          onChange={(e) => onChange({ type: "message", text: e.target.value })}
        />
      )}
    </div>
  );
}

export function RoutingFormEditor({
  form,
  eventTypes,
}: {
  form: RoutingForm;
  eventTypes: EventTypeOption[];
}) {
  const [state, action, pending] = useActionState(saveRoutingForm, {} as RoutingSaveState);
  const [rules, setRules] = useState<RoutingRule[]>(form.rules);
  const [fallback, setFallback] = useState<RoutingDestination | null>(form.fallback);
  const [questionIds, setQuestionIds] = useState(form.questions);
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  const setRule = (i: number, patch: Partial<RoutingRule>) =>
    setRules((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const select = "h-8 rounded-lg border bg-background px-2 text-sm";
  return (
    <form action={action} className="max-w-3xl space-y-8">
      <input type="hidden" name="id" value={form.id} />
      <input type="hidden" name="rulesJson" value={JSON.stringify(rules)} />
      <input type="hidden" name="fallbackJson" value={fallback ? JSON.stringify(fallback) : ""} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <BackLink href="/admin/routing">Routing forms</BackLink>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{form.name}</h1>
        </div>
        <ExternalLink href={`/r/${form.slug}`}>Preview</ExternalLink>
      </div>
      <FieldGroup>
        <div className="grid gap-6 sm:grid-cols-[1fr_200px]">
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" name="name" defaultValue={form.name} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="slug">URL slug</FieldLabel>
            <Input id="slug" name="slug" defaultValue={form.slug} />
            <FieldDescription>Public at /r/&lt;slug&gt;</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="description">Intro text</FieldLabel>
          <Textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={form.description ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel>Questions</FieldLabel>
          <QuestionBuilder initial={form.questions} onChange={setQuestionIds} />
        </Field>
        <Field>
          <FieldLabel>Rules</FieldLabel>
          <FieldDescription>
            Checked top to bottom; the first rule that matches decides where the visitor goes.
          </FieldDescription>
          <div className="space-y-3">
            {rules.map((r, i) => (
              <div key={r.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>When</span>
                  <select
                    value={r.match}
                    aria-label="Match"
                    className={select}
                    onChange={(e) => setRule(i, { match: e.target.value as RoutingRule["match"] })}
                  >
                    <option value="all">all</option>
                    <option value="any">any</option>
                  </select>
                  <span>of these hold:</span>
                  <button
                    type="button"
                    onClick={() => setRules((all) => all.filter((_, j) => j !== i))}
                    className="ml-auto text-xs text-destructive"
                  >
                    Remove rule
                  </button>
                </div>
                {r.conditions.map((c, k) => (
                  <div key={k} className="flex flex-wrap items-center gap-2">
                    <select
                      value={c.questionId}
                      aria-label="Question"
                      className={select}
                      onChange={(e) =>
                        setRule(i, {
                          conditions: r.conditions.map((x, m) =>
                            m === k ? { ...x, questionId: e.target.value } : x,
                          ),
                        })
                      }
                    >
                      {questionIds.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.label || q.id}
                        </option>
                      ))}
                    </select>
                    <select
                      value={c.op}
                      aria-label="Operator"
                      className={select}
                      onChange={(e) =>
                        setRule(i, {
                          conditions: r.conditions.map((x, m) =>
                            m === k ? { ...x, op: e.target.value as typeof c.op } : x,
                          ),
                        })
                      }
                    >
                      {OPS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {c.op !== "not_empty" && (
                      <Input
                        value={c.value}
                        aria-label="Value"
                        className="w-48"
                        onChange={(e) =>
                          setRule(i, {
                            conditions: r.conditions.map((x, m) =>
                              m === k ? { ...x, value: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    )}
                    <button
                      type="button"
                      aria-label="Remove condition"
                      className="px-1 text-destructive"
                      onClick={() =>
                        setRule(i, { conditions: r.conditions.filter((_, m) => m !== k) })
                      }
                    >
                      <XIcon className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={questionIds.length === 0}
                  onClick={() =>
                    setRule(i, {
                      conditions: [
                        ...r.conditions,
                        { questionId: questionIds[0]?.id ?? "", op: "equals", value: "" },
                      ],
                    })
                  }
                >
                  Add condition
                </Button>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>then</span>
                  <DestinationPicker
                    value={r.destination}
                    eventTypes={eventTypes}
                    onChange={(d) => d && setRule(i, { destination: d })}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRules((all) => [
                  ...all,
                  {
                    id: crypto.randomUUID().slice(0, 8),
                    match: "all",
                    conditions: [],
                    destination: { type: "event_type", eventTypeId: eventTypes[0]?.id ?? "" },
                  },
                ])
              }
            >
              Add rule
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel>Otherwise</FieldLabel>
          <FieldDescription>Where visitors go when no rule matches.</FieldDescription>
          <DestinationPicker value={fallback} eventTypes={eventTypes} onChange={setFallback} />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={form.active} /> Live (reachable at
          /r/{form.slug})
        </label>
        <div className="flex items-center justify-between">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => confirm("Delete this routing form?") && deleteRoutingForm(form.id)}
          >
            Delete
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
