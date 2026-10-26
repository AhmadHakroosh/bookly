"use client";

import { useActionState, useState, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  FIELD_LABELS,
  FIELD_TYPES,
  FILE_ACCEPT,
  isDisplayField,
  newField,
  opsFor,
  PUBLIC_FILE_MB,
  type Condition,
  type ConditionGroup,
  type Field,
  type FieldType,
  type FileAcceptPreset,
  type FormSchema,
} from "@bookly/forms";
import { Dropdown } from "@/components/dropdown";
import { FormFields } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { saveFormAction, type BuilderState } from "../actions";
import { fieldClasses } from "@/components/ui/input";

/*
 * The form builder (ADR 0004, slice S4): pages of questions of any field type, "show only
 * when" conditions on earlier answers, consent text and file questions, with a live preview
 * rendered by the same component the public page uses. Changes are a working copy until
 * published; publishing makes an immutable version, and answers keep pointing at the version
 * they were given to.
 */

const NEEDS_VALUE = new Set(["equals", "not_equals", "contains", "gt", "lt"]);
const textarea = `${fieldClasses} px-3 py-2`;

export function FormBuilder({
  formId,
  initial,
  published,
  version,
  hasDraft,
}: {
  formId: string;
  initial: FormSchema;
  published: FormSchema | null;
  version: number;
  hasDraft: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [state, action] = useActionState(async (prev: BuilderState, fd: FormData) => {
    const next = await saveFormAction(formId, prev, fd);
    if (next.done) setDirty(false);
    if (next.done === "discarded" && published) setForm(published);
    return next;
  }, {} as BuilderState);

  const edit = (fn: (f: FormSchema) => FormSchema) => {
    setForm(fn);
    setDirty(true);
  };
  const order = form.pages.flatMap((p) => p.fieldIds);
  const byId = new Map(form.fields.map((f) => [f.id, f]));
  const updateField = (id: string, patch: Partial<Field>) =>
    edit((s) => ({ ...s, fields: s.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  const addField = (pageId: string, type: FieldType) => {
    const f = newField(
      type,
      form.fields.map((x) => x.id),
    );
    edit((s) => ({
      ...s,
      fields: [...s.fields, f],
      pages: s.pages.map((p) => (p.id === pageId ? { ...p, fieldIds: [...p.fieldIds, f.id] } : p)),
    }));
    setOpen(f.id);
  };

  const removeField = (id: string) =>
    edit((s) => {
      // Conditions on the removed question go with it.
      const drop = (g?: ConditionGroup) =>
        g && { ...g, conditions: g.conditions.filter((c) => c.fieldId !== id) };
      return {
        ...s,
        fields: s.fields
          .filter((f) => f.id !== id)
          .map((f) => (f.visibleWhen ? { ...f, visibleWhen: drop(f.visibleWhen) } : f)),
        pages: s.pages.map((p) => ({
          ...p,
          fieldIds: p.fieldIds.filter((x) => x !== id),
          ...(p.visibleWhen ? { visibleWhen: drop(p.visibleWhen) } : {}),
        })),
      };
    });

  /** One place up or down; across the page break at the ends of a page. */
  const moveField = (id: string, dir: -1 | 1) =>
    edit((s) => {
      const pages = s.pages.map((p) => ({ ...p, fieldIds: [...p.fieldIds] }));
      const pi = pages.findIndex((p) => p.fieldIds.includes(id));
      const page = pages[pi]!;
      const i = page.fieldIds.indexOf(id);
      const j = i + dir;
      if (j >= 0 && j < page.fieldIds.length) {
        [page.fieldIds[i], page.fieldIds[j]] = [page.fieldIds[j]!, page.fieldIds[i]!];
      } else {
        const other = pages[pi + dir];
        if (!other) return s;
        page.fieldIds.splice(i, 1);
        if (dir < 0) other.fieldIds.push(id);
        else other.fieldIds.unshift(id);
      }
      return { ...s, pages };
    });

  const addPage = () =>
    edit((s) => {
      const taken = new Set(s.pages.map((p) => p.id));
      let n = s.pages.length + 1;
      while (taken.has(`p${n}`)) n++;
      return { ...s, pages: [...s.pages, { id: `p${n}`, fieldIds: [] }] };
    });

  const removePage = (id: string) =>
    edit((s) => {
      const i = s.pages.findIndex((p) => p.id === id);
      if (i <= 0) return s;
      // Its questions join the page before it.
      const pages = s.pages.map((p) => ({ ...p, fieldIds: [...p.fieldIds] }));
      pages[i - 1]!.fieldIds.push(...pages[i]!.fieldIds);
      pages.splice(i, 1);
      return { ...s, pages };
    });

  const status =
    state.done === "published"
      ? `Published as version ${state.version}.`
      : state.done === "saved"
        ? "Draft saved. People still see the published version."
        : state.done === "discarded"
          ? "Changes discarded."
          : dirty || hasDraft
            ? "Unpublished changes."
            : version
              ? `Version ${version} is live.`
              : "Not published yet.";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {form.pages.map((page, pi) => (
          <section
            key={page.id}
            aria-label={`Page ${pi + 1}`}
            className="space-y-3 rounded-xl border p-4"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Page {pi + 1}
              </span>
              <Input
                value={page.title ?? ""}
                onChange={(e) =>
                  edit((s) => ({
                    ...s,
                    pages: s.pages.map((p) =>
                      p.id === page.id ? { ...p, title: e.target.value || undefined } : p,
                    ),
                  }))
                }
                placeholder="Page title (optional)"
                aria-label={`Page ${pi + 1} title`}
                size="sm"
                className="flex-1"
                maxLength={500}
              />
              {pi > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove page ${pi + 1} (its questions move up)`}
                  onClick={() => removePage(page.id)}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
            <ol className="space-y-2">
              {page.fieldIds.map((id) => {
                const f = byId.get(id);
                if (!f) return null;
                const n = order.indexOf(id) + 1;
                const earlier = order
                  .slice(0, order.indexOf(id))
                  .map((x) => byId.get(x)!)
                  .filter((x) => x && !isDisplayField(x.type));
                return (
                  <li key={id}>
                    <FieldCard
                      field={f}
                      number={n}
                      first={n === 1}
                      last={n === order.length}
                      open={open === id}
                      onToggle={() => setOpen(open === id ? null : id)}
                      earlier={earlier}
                      update={(patch) => updateField(id, patch)}
                      move={(dir) => moveField(id, dir)}
                      remove={() => removeField(id)}
                    />
                  </li>
                );
              })}
            </ol>
            <AddQuestion onAdd={(type) => addField(page.id, type)} page={pi + 1} />
          </section>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addPage}>
          <PlusIcon /> Add page
        </Button>

        <form
          action={action}
          className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background py-3"
        >
          <input type="hidden" name="schema" value={JSON.stringify(form)} />
          <p className="me-auto text-sm text-muted-foreground" role="status">
            {status}
          </p>
          {(dirty || hasDraft) && published && (
            <IntentButton value="discard" variant="ghost" size="sm">
              Discard changes
            </IntentButton>
          )}
          <IntentButton value="draft" variant="outline" size="sm">
            Save draft
          </IntentButton>
          <IntentButton value="publish" size="sm">
            Publish
          </IntentButton>
          {state.problems?.length ? (
            <ul
              role="alert"
              className="basis-full list-disc space-y-0.5 rounded-lg border border-destructive/40 p-3 ps-7 text-sm text-destructive"
            >
              {state.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </form>
      </div>

      <aside aria-label="Preview" className="space-y-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <div className="rounded-xl border p-4">
          {form.fields.length ? (
            <FormFields formId={formId} schema={form} preview />
          ) : (
            <p className="text-sm text-muted-foreground">Add a question to see it here.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

/** One of the save bar's buttons: all wait while any is in flight; only the one pressed spins. */
function IntentButton({
  value,
  children,
  ...props
}: ComponentProps<typeof Button> & { value: "draft" | "publish" | "discard" }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("intent") === value;
  return (
    <Button
      type="submit"
      name="intent"
      value={value}
      disabled={pending}
      aria-busy={mine}
      {...props}
    >
      {mine && <Spinner data-icon="inline-start" />}
      {children}
    </Button>
  );
}

function AddQuestion({ onAdd, page }: { onAdd: (type: FieldType) => void; page: number }) {
  const [type, setType] = useState<FieldType>("short_text");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown
        value={type}
        onValueChange={(v) => setType(v as FieldType)}
        ariaLabel={`Type of question to add to page ${page}`}
        size="sm"
        className="w-52"
        options={FIELD_TYPES.map((t) => ({ value: t, label: FIELD_LABELS[t] }))}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => onAdd(type)}>
        <PlusIcon /> Add question
      </Button>
    </div>
  );
}

function FieldCard({
  field: f,
  number,
  first,
  last,
  open,
  onToggle,
  earlier,
  update,
  move,
  remove,
}: {
  field: Field;
  number: number;
  first: boolean;
  last: boolean;
  open: boolean;
  onToggle: () => void;
  earlier: Field[];
  update: (patch: Partial<Field>) => void;
  move: (dir: -1 | 1) => void;
  remove: () => void;
}) {
  const display = isDisplayField(f.type);
  const title = f.label.trim() || "Untitled";
  const name = `question ${number}`;
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-start text-sm hover:bg-muted"
        >
          <ChevronDownIcon
            className={`size-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{title}</span>
            {f.required && !display && <span className="text-muted-foreground"> *</span>}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {FIELD_LABELS[f.type]}
            {f.visibleWhen?.conditions.length ? " · conditional" : ""}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${name} up`}
          disabled={first}
          onClick={() => move(-1)}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${name} down`}
          disabled={last}
          onClick={() => move(1)}
        >
          <ArrowDownIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${name}`}
          onClick={remove}
        >
          <Trash2Icon />
        </Button>
      </div>
      {open && (
        <div className="space-y-3 border-t p-3 text-sm">
          {f.type === "paragraph" ? (
            <textarea
              value={f.label}
              onChange={(e) => update({ label: e.target.value })}
              aria-label="Text"
              placeholder="Text shown on the form"
              rows={3}
              maxLength={500}
              className={textarea}
            />
          ) : (
            <Input
              value={f.label}
              onChange={(e) => update({ label: e.target.value })}
              aria-label={f.type === "heading" ? "Heading" : "Question"}
              placeholder={f.type === "heading" ? "Heading" : "Question"}
              maxLength={500}
            />
          )}
          {!display && (
            <>
              <Input
                value={f.help ?? ""}
                onChange={(e) => update({ help: e.target.value || undefined })}
                aria-label="Help text"
                placeholder="Help text (optional)"
                maxLength={2000}
              />
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!f.required}
                  onChange={(e) => update({ required: e.target.checked })}
                />
                Required
              </label>
            </>
          )}
          {(f.type === "select" || f.type === "multi_select") && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">
                Options, one per line
              </span>
              <textarea
                defaultValue={(f.options ?? []).map((o) => o.label).join("\n")}
                onChange={(e) => {
                  const lines = [
                    ...new Set(
                      e.target.value
                        .split("\n")
                        .map((l) => l.trim().slice(0, 500))
                        .filter(Boolean),
                    ),
                  ].slice(0, 200);
                  update({ options: lines.map((l) => ({ value: l, label: l })) });
                }}
                rows={4}
                className={textarea}
              />
            </label>
          )}
          {f.type === "file" && <FileSettings field={f} update={update} />}
          {f.type === "consent" && <ConsentSettings field={f} update={update} />}
          <Conditions
            group={f.visibleWhen}
            earlier={earlier}
            onChange={(g) => update({ visibleWhen: g })}
          />
        </div>
      )}
    </div>
  );
}

function presetOf(accept: string[]): FileAcceptPreset | "any" {
  const key = [...accept].sort().join();
  for (const [k, v] of Object.entries(FILE_ACCEPT))
    if ([...v.accept].sort().join() === key) return k as FileAcceptPreset;
  return "any";
}

function FileSettings({ field: f, update }: { field: Field; update: (p: Partial<Field>) => void }) {
  const file = f.file ?? { accept: [], maxMb: PUBLIC_FILE_MB, maxFiles: 1 };
  const clamp = (v: string, max: number) => Math.min(max, Math.max(1, Math.round(Number(v) || 1)));
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <span className="mb-1 block text-xs text-muted-foreground">Accepted files</span>
        <Dropdown
          value={presetOf(file.accept)}
          onValueChange={(v) =>
            update({
              file: {
                ...file,
                accept: v === "any" ? [] : [...FILE_ACCEPT[v as FileAcceptPreset].accept],
              },
            })
          }
          ariaLabel="Accepted files"
          size="sm"
          className="w-56"
          options={[
            ...Object.entries(FILE_ACCEPT).map(([k, v]) => ({ value: k, label: v.label })),
            { value: "any", label: "Any document, image or media" },
          ]}
        />
      </div>
      <label>
        <span className="mb-1 block text-xs text-muted-foreground">Files</span>
        <Input
          type="number"
          min={1}
          max={10}
          value={file.maxFiles}
          onChange={(e) => update({ file: { ...file, maxFiles: clamp(e.target.value, 10) } })}
          size="sm"
          className="w-20"
        />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted-foreground">MB each</span>
        <Input
          type="number"
          min={1}
          max={PUBLIC_FILE_MB}
          value={file.maxMb}
          onChange={(e) =>
            update({ file: { ...file, maxMb: clamp(e.target.value, PUBLIC_FILE_MB) } })
          }
          size="sm"
          className="w-20"
        />
      </label>
    </div>
  );
}

const CONSENT_KINDS = [
  { value: "privacy", label: "Privacy notice" },
  { value: "terms", label: "Terms" },
  { value: "capture", label: "Recording or transcription" },
  { value: "custom", label: "Other" },
];

function ConsentSettings({
  field: f,
  update,
}: {
  field: Field;
  update: (p: Partial<Field>) => void;
}) {
  const consent = f.consent ?? { kind: "custom" as const, text: "", version: "1" };
  return (
    <div className="space-y-2">
      <Dropdown
        value={consent.kind}
        onValueChange={(v) =>
          update({ consent: { ...consent, kind: v as NonNullable<Field["consent"]>["kind"] } })
        }
        ariaLabel="Kind of consent"
        className="h-8 w-56"
        options={CONSENT_KINDS}
      />
      <textarea
        value={consent.text}
        onChange={(e) => update({ consent: { ...consent, text: e.target.value } })}
        aria-label="What people agree to"
        placeholder="What people agree to. Each answer keeps the version of this text."
        rows={3}
        maxLength={5000}
        className={textarea}
      />
      <Input
        value={consent.url ?? ""}
        onChange={(e) => update({ consent: { ...consent, url: e.target.value || undefined } })}
        aria-label="Link to the full text"
        placeholder="Link to the full text (optional)"
        type="url"
      />
    </div>
  );
}

function Conditions({
  group,
  earlier,
  onChange,
}: {
  group: ConditionGroup | undefined;
  earlier: Field[];
  onChange: (g: ConditionGroup | undefined) => void;
}) {
  const conditions = group?.conditions ?? [];
  const blank = (): Condition => {
    const f = earlier.at(-1)!;
    const def = opsFor(f.type)[0]!;
    return { fieldId: f.id, op: def.op, ...(def.value !== undefined ? { value: def.value } : {}) };
  };
  const set = (next: Condition[]) =>
    onChange(next.length ? { match: group?.match ?? "all", conditions: next } : undefined);

  if (!earlier.length)
    return (
      <p className="text-xs text-muted-foreground">
        Questions further down can be shown depending on this one&apos;s answer.
      </p>
    );
  if (!conditions.length)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => set([blank()])}>
        <PlusIcon /> Show only when…
      </Button>
    );
  return (
    <fieldset className="space-y-2 rounded-lg bg-muted/40 p-2">
      <legend className="sr-only">Show this question only when</legend>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        Show only when{" "}
        {conditions.length > 1 ? (
          <Dropdown
            value={group!.match}
            onValueChange={(v) => onChange({ ...group!, match: v as "all" | "any" })}
            ariaLabel="All or any of the conditions"
            className="h-7 w-44"
            size="sm"
            options={[
              { value: "all", label: "all of these hold" },
              { value: "any", label: "any of these holds" },
            ]}
          />
        ) : (
          "this holds"
        )}
      </div>
      {conditions.map((c, i) => {
        const target = earlier.find((f) => f.id === c.fieldId) ?? earlier.at(-1)!;
        const ops = opsFor(target.type);
        const opIndex = Math.max(
          0,
          ops.findIndex((o) => o.op === c.op && (o.value === undefined || o.value === c.value)),
        );
        const def = ops[opIndex]!;
        const replace = (next: Condition) => set(conditions.map((x, j) => (j === i ? next : x)));
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Dropdown
              value={target.id}
              onValueChange={(id) => {
                const f = earlier.find((x) => x.id === id)!;
                const d = opsFor(f.type)[0]!;
                replace({
                  fieldId: id,
                  op: d.op,
                  ...(d.value !== undefined ? { value: d.value } : {}),
                });
              }}
              ariaLabel={`Condition ${i + 1}: question`}
              size="sm"
              className="w-48"
              options={earlier.map((f) => ({ value: f.id, label: f.label.trim() || "Untitled" }))}
            />
            <Dropdown
              value={String(opIndex)}
              onValueChange={(v) => {
                const d = ops[Number(v)]!;
                replace({
                  fieldId: target.id,
                  op: d.op,
                  ...(d.value !== undefined
                    ? { value: d.value }
                    : NEEDS_VALUE.has(d.op)
                      ? {
                          value:
                            typeof c.value === "string" || typeof c.value === "number"
                              ? c.value
                              : "",
                        }
                      : {}),
                });
              }}
              ariaLabel={`Condition ${i + 1}: comparison`}
              size="sm"
              className="w-40"
              options={ops.map((o, j) => ({ value: String(j), label: o.label }))}
            />
            {def.value === undefined &&
              NEEDS_VALUE.has(def.op) &&
              (target.options?.length ? (
                <Dropdown
                  value={typeof c.value === "string" && c.value ? c.value : undefined}
                  onValueChange={(v) => replace({ ...c, fieldId: target.id, value: v })}
                  ariaLabel={`Condition ${i + 1}: answer`}
                  size="sm"
                  className="w-44"
                  options={target.options.map((o) => ({ value: o.value, label: o.label }))}
                />
              ) : (
                <Input
                  value={typeof c.value === "string" || typeof c.value === "number" ? c.value : ""}
                  onChange={(e) =>
                    replace({
                      ...c,
                      fieldId: target.id,
                      value: target.type === "number" ? Number(e.target.value) : e.target.value,
                    })
                  }
                  type={target.type === "number" ? "number" : "text"}
                  aria-label={`Condition ${i + 1}: answer`}
                  size="sm"
                  className="w-44"
                />
              ))}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove condition ${i + 1}`}
              onClick={() => set(conditions.filter((_, j) => j !== i))}
            >
              <XIcon />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="ghost" size="sm" onClick={() => set([...conditions, blank()])}>
        <PlusIcon /> Add condition
      </Button>
    </fieldset>
  );
}
