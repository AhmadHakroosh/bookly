// SPDX-License-Identifier: AGPL-3.0-only
import { z } from "zod";

/**
 * The forms engine (ADR 0004): one schema, one condition evaluator and one validator for every
 * form in Bookly (booking questions, routing forms, applications, stage and reference forms).
 * Pure: no database, safe in the browser (show/hide while typing) and on the server
 * (authoritative validation).
 */

/* ---------------- Schema ---------------- */

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "date",
  "select",
  "multi_select",
  "yes_no",
  "checkbox",
  "consent",
  "file",
  "heading",
  "paragraph",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Display-only types: no answer. */
const DISPLAY: ReadonlySet<FieldType> = new Set(["heading", "paragraph"]);

export const CONDITION_OPS = [
  "equals",
  "not_equals",
  "contains",
  "not_empty",
  "empty",
  "in",
  "gt",
  "lt",
  "checked",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export type Condition = { fieldId: string; op: ConditionOp; value?: string | number | string[] };
export type ConditionGroup = { match: "all" | "any"; conditions: Condition[] };

export type Field = {
  /** Stable across versions; answers are keyed by it. Migrated questions keep their old ids. */
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Shown only when this holds; hidden fields' answers are dropped on the server. */
  visibleWhen?: ConditionGroup;
  validation?: { min?: number; max?: number; pattern?: string; maxLength?: number };
  file?: { accept: string[]; maxMb: number; maxFiles: number };
  /** What was agreed and which version of the text; recorded with the answer. */
  consent?: {
    kind: "privacy" | "terms" | "capture" | "custom";
    text: string;
    version: string;
    url?: string;
  };
  /** sensitive answers never go into responses, exports or AI context (ADR 0003). */
  sensitivity?: "normal" | "sensitive";
  mapsTo?: "contact.name" | "contact.email" | "contact.phone" | "contact.company";
};

export type FormSchema = {
  v: 1;
  pages: { id: string; title?: string; fieldIds: string[]; visibleWhen?: ConditionGroup }[];
  fields: Field[];
  /** Reserved for i18n (Phase 4.5). */
  i18n?: Record<string, Record<string, Partial<Pick<Field, "label" | "help">>>>;
};

export type AnswerValue = string | number | boolean | string[] | { fileIds: string[] } | null;
export type Answers = Record<string, AnswerValue>;

export const LIMITS = {
  fields: 200,
  pages: 30,
  options: 200,
  label: 500,
  help: 2000,
  files: 10,
  fileMb: 25,
  answer: 10_000,
} as const;

const id = z.string().min(1).max(64);
const condition = z.object({
  fieldId: id,
  op: z.enum(CONDITION_OPS),
  value: z
    .union([z.string().max(500), z.number(), z.array(z.string().max(500)).max(200)])
    .optional(),
});
const group = z.object({ match: z.enum(["all", "any"]), conditions: z.array(condition).max(20) });

const field = z.object({
  id,
  type: z.enum(FIELD_TYPES),
  label: z.string().max(LIMITS.label),
  help: z.string().max(LIMITS.help).optional(),
  required: z.boolean().optional(),
  options: z
    .array(z.object({ value: z.string().min(1).max(500), label: z.string().min(1).max(500) }))
    .max(LIMITS.options)
    .optional(),
  visibleWhen: group.optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().max(500).optional(),
      maxLength: z.number().int().positive().max(LIMITS.answer).optional(),
    })
    .optional(),
  file: z
    .object({
      accept: z.array(z.string().max(100)).max(50),
      maxMb: z.number().positive().max(LIMITS.fileMb),
      maxFiles: z.number().int().positive().max(LIMITS.files),
    })
    .optional(),
  consent: z
    .object({
      kind: z.enum(["privacy", "terms", "capture", "custom"]),
      text: z.string().min(1).max(5000),
      version: z.string().min(1).max(64),
      url: z.url().optional(),
    })
    .optional(),
  sensitivity: z.enum(["normal", "sensitive"]).optional(),
  mapsTo: z.enum(["contact.name", "contact.email", "contact.phone", "contact.company"]).optional(),
});

export const formSchema = z
  .object({
    v: z.literal(1),
    pages: z
      .array(
        z.object({
          id,
          title: z.string().max(LIMITS.label).optional(),
          fieldIds: z.array(id).max(LIMITS.fields),
          visibleWhen: group.optional(),
        }),
      )
      .min(1)
      .max(LIMITS.pages),
    fields: z.array(field).max(LIMITS.fields),
    i18n: z
      .record(
        z.string(),
        z.record(z.string(), z.object({ label: z.string(), help: z.string() }).partial()),
      )
      .optional(),
  })
  .superRefine((s, ctx) => {
    const ids = new Set<string>();
    for (const f of s.fields) {
      if (ids.has(f.id))
        ctx.addIssue({ code: "custom", message: `Field id "${f.id}" is used twice.` });
      ids.add(f.id);
      if ((f.type === "select" || f.type === "multi_select") && !f.options?.length)
        ctx.addIssue({
          code: "custom",
          message: `"${f.label || f.id}" needs at least one option.`,
        });
      if (f.type === "consent" && !f.consent)
        ctx.addIssue({
          code: "custom",
          message: `"${f.label || f.id}" needs the text people agree to.`,
        });
    }
    const placed = new Set(s.pages.flatMap((p) => p.fieldIds));
    for (const p of s.pages)
      for (const fid of p.fieldIds)
        if (!ids.has(fid))
          ctx.addIssue({ code: "custom", message: `Page "${p.id}" lists unknown field "${fid}".` });
    for (const f of s.fields)
      if (!placed.has(f.id))
        ctx.addIssue({ code: "custom", message: `"${f.label || f.id}" is on no page.` });
    // Conditions look back only: a field depends on answers above it, a page on earlier pages,
    // so showing or hiding something can never loop.
    const byId = new Map(s.fields.map((f) => [f.id, f]));
    const before = new Set<string>();
    for (const p of s.pages) {
      for (const c of p.visibleWhen?.conditions ?? [])
        if (!before.has(c.fieldId))
          ctx.addIssue({
            code: "custom",
            message: `Page "${p.title || p.id}" can only depend on questions on earlier pages.`,
          });
      const onPage = new Set<string>();
      for (const fid of p.fieldIds) {
        const f = byId.get(fid);
        for (const c of f?.visibleWhen?.conditions ?? [])
          if (!before.has(c.fieldId) && !onPage.has(c.fieldId))
            ctx.addIssue({
              code: "custom",
              message: `"${f!.label || f!.id}" can only depend on questions above it.`,
            });
        if (f && !DISPLAY.has(f.type)) onPage.add(fid);
      }
      for (const fid of onPage) before.add(fid);
    }
  });

/** A stored or submitted schema, checked; the problems in plain words when it is not valid. */
export function parseFormSchema(raw: unknown): { schema: FormSchema } | { problems: string[] } {
  const r = formSchema.safeParse(raw);
  return r.success
    ? { schema: r.data as FormSchema }
    : { problems: r.error.issues.map((i) => i.message) };
}

/* ---------------- Conditions ---------------- */

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim().toLowerCase();
const isChecked = (v: AnswerValue | undefined) =>
  v === true || ["true", "yes", "on", "1"].includes(norm(v));
const isEmpty = (v: AnswerValue | undefined) =>
  v === null ||
  v === undefined ||
  v === false ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && v !== null && v.fileIds.length === 0) ||
  (typeof v === "string" && !v.trim());

/**
 * One condition against the answers. String comparisons are trimmed and case-insensitive, so
 * "Yes" matches "yes " (the routing semantics since 0.4). Multi-select answers hold when any
 * chosen option matches.
 */
export function conditionHolds(c: Condition, answers: Answers): boolean {
  const a = answers[c.fieldId];
  const many = Array.isArray(a) ? a.map(norm) : null;
  const v = Array.isArray(c.value) ? "" : norm(c.value);
  switch (c.op) {
    case "equals":
      return many ? many.includes(v) : norm(a) === v;
    case "not_equals":
      return many ? !many.includes(v) : norm(a) !== v;
    case "contains":
      return v.length > 0 && (many ? many.some((x) => x.includes(v)) : norm(a).includes(v));
    case "not_empty":
      return !isEmpty(a);
    case "empty":
      return isEmpty(a);
    case "in": {
      const set = (Array.isArray(c.value) ? c.value : [String(c.value ?? "")]).map(norm);
      return many ? many.some((x) => set.includes(x)) : set.includes(norm(a));
    }
    case "gt":
    case "lt": {
      const n = Number(typeof a === "string" ? a.trim() : a);
      const m = Number(c.value);
      if (!Number.isFinite(n) || !Number.isFinite(m) || isEmpty(a)) return false;
      return c.op === "gt" ? n > m : n < m;
    }
    case "checked":
      return isChecked(a);
  }
}

/** A group holds when all (or any) of its conditions do; an empty group always holds. */
export function evaluate(group: ConditionGroup | undefined, answers: Answers): boolean {
  if (!group || !group.conditions.length) return true;
  return group.match === "any"
    ? group.conditions.some((c) => conditionHolds(c, answers))
    : group.conditions.every((c) => conditionHolds(c, answers));
}

/** The fields a person sees given their answers so far, in page order. */
export function visibleFields(schema: FormSchema, answers: Answers): Field[] {
  const byId = new Map(schema.fields.map((f) => [f.id, f]));
  return schema.pages
    .filter((p) => evaluate(p.visibleWhen, answers))
    .flatMap((p) => p.fieldIds.map((fid) => byId.get(fid)!).filter(Boolean))
    .filter((f) => evaluate(f.visibleWhen, answers));
}

/* ---------------- Building ---------------- */

/** Field types the builder offers, in its menu order, with the words it uses. */
export const FIELD_LABELS: Record<FieldType, string> = {
  short_text: "Short answer",
  long_text: "Paragraph",
  email: "Email",
  phone: "Phone",
  url: "Link",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  multi_select: "Checkboxes (several)",
  yes_no: "Yes or no",
  checkbox: "Checkbox",
  consent: "Consent",
  file: "File upload",
  heading: "Heading",
  paragraph: "Text block",
};

export const isDisplayField = (type: FieldType) => DISPLAY.has(type);

/** Accepted file types the builder offers. Entries are MIME types; `image/*` matches any image. */
export const FILE_ACCEPT = {
  documents: {
    label: "Documents (PDF, Word, text)",
    accept: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
  },
  images: { label: "Images", accept: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
  pdf: { label: "PDF only", accept: ["application/pdf"] },
} as const;
export type FileAcceptPreset = keyof typeof FILE_ACCEPT;

/** Public forms take files up to this size, whatever a field allows (ADR 0004, question 1). */
export const PUBLIC_FILE_MB = 10;

/** Whether a field takes a file of this type (`accept` empty: any type the app allows). */
export function fileAccepted(f: Pick<Field, "file">, mime: string): boolean {
  const accept = f.file?.accept ?? [];
  const m = mime.toLowerCase();
  return (
    !accept.length ||
    accept.some((a) => (a.endsWith("/*") ? m.startsWith(a.slice(0, -1)) : a.toLowerCase() === m))
  );
}

/** A fresh field of a type with workable defaults; its id is new among `taken`. */
export function newField(type: FieldType, taken: Iterable<string> = []): Field {
  const used = new Set(taken);
  let id = "";
  do id = `f_${Math.random().toString(36).slice(2, 8)}`;
  while (used.has(id) || id.length < 8);
  const base: Field = { id, type, label: "" };
  switch (type) {
    case "select":
    case "multi_select":
      return { ...base, options: [{ value: "Option 1", label: "Option 1" }] };
    case "consent":
      return { ...base, required: true, consent: { kind: "custom", text: "", version: "1" } };
    case "file":
      return {
        ...base,
        file: { accept: [...FILE_ACCEPT.documents.accept], maxMb: PUBLIC_FILE_MB, maxFiles: 1 },
      };
    default:
      return base;
  }
}

/**
 * The comparisons that make sense for a field's answers, as the builder words them. Yes-or-no
 * and checkbox answers are booleans: "is yes" is `checked`, "is no" is `equals "false"`.
 */
export function opsFor(type: FieldType): { op: ConditionOp; label: string; value?: string }[] {
  const presence = [
    { op: "not_empty" as const, label: "is answered" },
    { op: "empty" as const, label: "is not answered" },
  ];
  switch (type) {
    case "select":
    case "multi_select":
      return [
        { op: "equals", label: type === "select" ? "is" : "includes" },
        { op: "not_equals", label: type === "select" ? "is not" : "does not include" },
        ...presence,
      ];
    case "yes_no":
      return [
        { op: "checked", label: "is yes" },
        { op: "equals", label: "is no", value: "false" },
      ];
    case "checkbox":
    case "consent":
      return [
        { op: "checked", label: "is ticked" },
        { op: "empty", label: "is not ticked" },
      ];
    case "number":
      return [
        { op: "equals", label: "equals" },
        { op: "gt", label: "is more than" },
        { op: "lt", label: "is less than" },
        ...presence,
      ];
    case "file":
      return [
        { op: "not_empty", label: "has a file" },
        { op: "empty", label: "has no file" },
      ];
    case "heading":
    case "paragraph":
      return [];
    default:
      return [
        { op: "equals", label: "is" },
        { op: "not_equals", label: "is not" },
        { op: "contains", label: "contains" },
        ...presence,
      ];
  }
}

/** The form-field name an answer is posted under (`q_<id>`, as booking questions always were). */
export const answerName = (fieldId: string) => `q_${fieldId}`;

/**
 * A posted form's raw answers for `validateResponse`: several values for checkboxes, comma-
 * separated file ids for uploads, the last value otherwise (a checkbox may post a hidden
 * fallback first). `getAll` is `FormData.getAll` or an equivalent.
 */
export function answersFromEntries(
  schema: FormSchema,
  getAll: (name: string) => unknown[],
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (DISPLAY.has(f.type)) continue;
    const values = getAll(answerName(f.id))
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.slice(0, LIMITS.answer));
    if (!values.length) continue;
    if (f.type === "multi_select") raw[f.id] = values.filter((v) => v.trim());
    else if (f.type === "file")
      raw[f.id] = {
        fileIds: values
          .flatMap((v) => v.split(","))
          .map((v) => v.trim())
          .filter(Boolean),
      };
    else raw[f.id] = values.at(-1);
  }
  return raw;
}

/* ---------------- Validation ---------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\-.\s\d]{5,40}$/;

function coerce(f: Field, raw: unknown): AnswerValue {
  if (raw === undefined || raw === null) return null;
  switch (f.type) {
    case "multi_select":
      return (Array.isArray(raw) ? raw : [raw]).map((x) => String(x).trim()).filter(Boolean);
    case "yes_no":
    case "checkbox":
    case "consent":
      return isChecked(raw as AnswerValue);
    case "number": {
      const s = String(raw).trim();
      return s ? Number(s) : null;
    }
    case "file":
      return typeof raw === "object" &&
        raw &&
        "fileIds" in raw &&
        Array.isArray((raw as { fileIds: unknown }).fileIds)
        ? { fileIds: (raw as { fileIds: unknown[] }).fileIds.map(String) }
        : null;
    default:
      return String(raw).slice(0, LIMITS.answer);
  }
}

function fieldError(f: Field, v: AnswerValue): string | null {
  if (isEmpty(v)) return f.required ? `Please answer: ${f.label}` : null;
  const s = typeof v === "string" ? v.trim() : "";
  const optionValues = new Set((f.options ?? []).map((o) => o.value));
  switch (f.type) {
    case "email":
      if (!EMAIL.test(s)) return `${f.label}: enter an email address.`;
      break;
    case "phone":
      if (!PHONE.test(s)) return `${f.label}: enter a phone number.`;
      break;
    case "url":
      if (!/^https?:\/\/\S+\.\S+/.test(s))
        return `${f.label}: enter a link starting with https://.`;
      break;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))
        return `${f.label}: enter a date.`;
      break;
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) return `${f.label}: enter a number.`;
      if (f.validation?.min !== undefined && v < f.validation.min)
        return `${f.label}: at least ${f.validation.min}.`;
      if (f.validation?.max !== undefined && v > f.validation.max)
        return `${f.label}: at most ${f.validation.max}.`;
      break;
    case "select":
      if (!optionValues.has(String(v))) return `${f.label}: choose one of the options.`;
      break;
    case "multi_select":
      if (!(v as string[]).every((x) => optionValues.has(x)))
        return `${f.label}: choose from the options.`;
      break;
    case "file":
      if ((v as { fileIds: string[] }).fileIds.length > (f.file?.maxFiles ?? LIMITS.files))
        return `${f.label}: too many files.`;
      break;
    case "consent":
      if (f.required && v !== true) return `Please agree: ${f.label}`;
      break;
  }
  if (s && f.validation?.maxLength && s.length > f.validation.maxLength)
    return `${f.label}: at most ${f.validation.maxLength} characters.`;
  if (s && f.validation?.pattern) {
    try {
      if (!new RegExp(f.validation.pattern).test(s)) return `${f.label}: check the format.`;
    } catch {
      // A bad pattern in a stored form never blocks a person.
    }
  }
  return null;
}

/**
 * The server's check of a submission: answers to hidden and display fields are dropped,
 * required checks apply to visible fields only, and sensitive answers are split out so they
 * never reach a form response.
 */
/** Raw answers in their typed form, as the server reads them (for live show/hide in the browser). */
export function coerceAnswers(schema: FormSchema, raw: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const f of schema.fields) if (!DISPLAY.has(f.type)) out[f.id] = coerce(f, raw[f.id]);
  return out;
}

export function validateResponse(
  schema: FormSchema,
  raw: Record<string, unknown>,
): { answers: Answers; sensitive: Answers; errors: { fieldId: string; message: string }[] } {
  const coerced = coerceAnswers(schema, raw);
  const answers: Answers = {};
  const sensitive: Answers = {};
  const errors: { fieldId: string; message: string }[] = [];
  for (const f of visibleFields(schema, coerced)) {
    if (DISPLAY.has(f.type)) continue;
    const v = coerced[f.id] ?? null;
    const e = fieldError(f, v);
    if (e) errors.push({ fieldId: f.id, message: e });
    if (isEmpty(v) && v !== false) continue;
    (f.sensitivity === "sensitive" ? sensitive : answers)[f.id] = v;
  }
  return { answers, sensitive, errors };
}

/** Plain-text answers (from `flattenAnswers`) keyed by their question, for timelines. */
export function labelAnswers(schema: FormSchema, flat: Record<string, string>) {
  return Object.fromEntries(
    schema.fields
      .filter((f) => flat[f.id]?.trim())
      .map((f) => [f.label || f.id, flat[f.id]!.trim()]),
  );
}

/** Answers as plain text by field id, for emails, briefings and `bookings.answers`. */
export function flattenAnswers(schema: FormSchema, answers: Answers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of schema.fields) {
    const v = answers[f.id];
    if (v === undefined || v === null || DISPLAY.has(f.type)) continue;
    const label = (x: string) => f.options?.find((o) => o.value === x)?.label ?? x;
    out[f.id] = Array.isArray(v)
      ? v.map(label).join(", ")
      : typeof v === "boolean"
        ? v
          ? "Yes"
          : "No"
        : typeof v === "object"
          ? `${v.fileIds.length} file${v.fileIds.length === 1 ? "" : "s"}`
          : typeof v === "string" && f.type === "select"
            ? label(v)
            : String(v);
  }
  return out;
}

/* ---------------- Legacy questions (until 1.1) ---------------- */

/** The question shape event types and routing forms stored before forms (dropped in 1.1). */
export type LegacyQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "email" | "phone" | "select";
  required: boolean;
  options?: string[];
};

const FROM_LEGACY: Record<LegacyQuestion["type"], FieldType> = {
  text: "short_text",
  textarea: "long_text",
  email: "email",
  phone: "phone",
  select: "select",
};
const TO_LEGACY: Partial<Record<FieldType, LegacyQuestion["type"]>> = {
  short_text: "text",
  long_text: "textarea",
  email: "email",
  phone: "phone",
  select: "select",
};

/**
 * Legacy questions as a one-page form, ids kept so stored answers and routing conditions stay
 * valid. Keep in step with the backfill in packages/db/drizzle/0040_forms.sql.
 */
export function fromEventQuestions(questions: LegacyQuestion[]): FormSchema {
  return {
    v: 1,
    pages: [{ id: "p1", fieldIds: questions.map((q) => q.id) }],
    fields: questions.map((q) => ({
      id: q.id,
      // A select without options could never be answered: it becomes a text question.
      type:
        q.type === "select" && !q.options?.length
          ? "short_text"
          : (FROM_LEGACY[q.type] ?? "short_text"),
      label: q.label,
      required: !!q.required,
      ...(q.options?.length ? { options: q.options.map((o) => ({ value: o, label: o })) } : {}),
    })),
  };
}

/**
 * A form as legacy questions, for the pages and readers that still take them. Only the five
 * legacy types convert exactly; anything else reads as a text question, files are left out
 * (a legacy page cannot take one), and a question that is only sometimes shown is never
 * required (a legacy page cannot hide it).
 */
export function toEventQuestions(schema: FormSchema): LegacyQuestion[] {
  const conditionalPage = new Set(
    schema.pages.filter((p) => p.visibleWhen?.conditions.length).flatMap((p) => p.fieldIds),
  );
  return schema.fields
    .filter((f) => !DISPLAY.has(f.type) && f.type !== "file" && f.sensitivity !== "sensitive")
    .map((f) => {
      const type = TO_LEGACY[f.type] ?? "text";
      const sometimes = !!f.visibleWhen?.conditions.length || conditionalPage.has(f.id);
      return {
        id: f.id,
        label: f.label,
        type,
        required: !!f.required && !sometimes,
        ...(type === "select" ? { options: (f.options ?? []).map((o) => o.label) } : {}),
      };
    });
}

/** JSON with object keys sorted, so two equal values serialise the same (jsonb reorders keys). */
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(v ?? null);

/** Whether two schemas describe the same form (editors publish a new version only on change). */
export const sameSchema = (a: FormSchema | null | undefined, b: FormSchema | null | undefined) =>
  canonical(a ?? null) === canonical(b ?? null);
