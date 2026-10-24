import { describe, expect, it } from "vitest";
import {
  answersFromEntries,
  coerceAnswers,
  conditionHolds,
  evaluate,
  fileAccepted,
  flattenAnswers,
  fromEventQuestions,
  newField,
  opsFor,
  parseFormSchema,
  sameSchema,
  toEventQuestions,
  validateResponse,
  visibleFields,
  type FormSchema,
  type LegacyQuestion,
} from "../index";

const legacy: LegacyQuestion[] = [
  { id: "q1_topic", label: "What would you like to discuss?", type: "textarea", required: true },
  { id: "q2_size", label: "Team size", type: "select", required: false, options: ["1-10", "50+"] },
  { id: "q3_mail", label: "Work email", type: "email", required: false },
];

const application: FormSchema = {
  v: 1,
  pages: [
    { id: "about", fieldIds: ["intro", "name", "student", "school", "cv"] },
    {
      id: "extra",
      fieldIds: ["topics", "years", "agree", "access"],
      visibleWhen: { match: "all", conditions: [{ fieldId: "name", op: "not_empty" }] },
    },
  ],
  fields: [
    { id: "intro", type: "heading", label: "About you" },
    { id: "name", type: "short_text", label: "Name", required: true, mapsTo: "contact.name" },
    { id: "student", type: "yes_no", label: "Are you a student?" },
    {
      id: "school",
      type: "short_text",
      label: "School",
      required: true,
      visibleWhen: { match: "all", conditions: [{ fieldId: "student", op: "checked" }] },
    },
    {
      id: "cv",
      type: "file",
      label: "CV",
      file: { accept: ["application/pdf"], maxMb: 5, maxFiles: 1 },
    },
    {
      id: "topics",
      type: "multi_select",
      label: "Topics",
      options: [
        { value: "ai", label: "AI" },
        { value: "climate", label: "Climate" },
      ],
    },
    { id: "years", type: "number", label: "Years of experience", validation: { min: 0, max: 60 } },
    {
      id: "agree",
      type: "consent",
      label: "Privacy notice",
      required: true,
      consent: {
        kind: "privacy",
        text: "We keep your application for 6 months.",
        version: "2026-10-24",
      },
    },
    { id: "access", type: "long_text", label: "Accommodations", sensitivity: "sensitive" },
  ],
};

describe("legacy questions", () => {
  it("become a one-page form with the same ids, and convert back exactly", () => {
    const schema = fromEventQuestions(legacy);
    expect(parseFormSchema(schema)).toEqual({ schema });
    expect(schema.pages[0]!.fieldIds).toEqual(["q1_topic", "q2_size", "q3_mail"]);
    expect(schema.fields.map((f) => f.type)).toEqual(["long_text", "select", "email"]);
    expect(toEventQuestions(schema)).toEqual(legacy);
  });

  it("turns a select without options into a text question it can answer", () => {
    const schema = fromEventQuestions([
      { id: "s", label: "Pick", type: "select", required: true, options: [] },
    ]);
    expect(schema.fields[0]!.type).toBe("short_text");
    expect("schema" in parseFormSchema(schema)).toBe(true);
  });

  it("an empty question list is a valid empty form", () => {
    expect("schema" in parseFormSchema(fromEventQuestions([]))).toBe(true);
  });
});

describe("parseFormSchema", () => {
  it("accepts a full application form", () => {
    expect(parseFormSchema(application)).toEqual({ schema: application });
  });

  it("explains what is wrong", () => {
    const bad = {
      ...application,
      fields: [
        ...application.fields,
        { id: "name", type: "short_text", label: "Again" },
        { id: "pick", type: "select", label: "Pick" },
        { id: "orphan", type: "short_text", label: "Orphan" },
      ],
    };
    const r = parseFormSchema(bad);
    expect("problems" in r && r.problems).toEqual(
      expect.arrayContaining([
        'Field id "name" is used twice.',
        '"Pick" needs at least one option.',
        '"Orphan" is on no page.',
      ]),
    );
  });
});

describe("condition order", () => {
  const two = (visibleWhen: FormSchema["fields"][number]["visibleWhen"]): FormSchema => ({
    v: 1,
    pages: [{ id: "p1", fieldIds: ["a", "b"] }],
    fields: [
      { id: "a", type: "yes_no", label: "A", visibleWhen },
      { id: "b", type: "short_text", label: "B" },
    ],
  });

  it("refuses a field that depends on itself or on a later question", () => {
    for (const fieldId of ["a", "b", "missing"]) {
      const r = parseFormSchema(two({ match: "all", conditions: [{ fieldId, op: "not_empty" }] }));
      expect("problems" in r && r.problems).toEqual(['"A" can only depend on questions above it.']);
    }
  });

  it("lets a page depend only on earlier pages", () => {
    const s: FormSchema = {
      v: 1,
      pages: [
        { id: "p1", fieldIds: ["a"] },
        {
          id: "p2",
          title: "More",
          fieldIds: ["b"],
          visibleWhen: { match: "all", conditions: [{ fieldId: "a", op: "checked" }] },
        },
      ],
      fields: [
        { id: "a", type: "yes_no", label: "A" },
        { id: "b", type: "short_text", label: "B" },
      ],
    };
    expect(parseFormSchema(s)).toEqual({ schema: s });
    const own = {
      ...s,
      pages: [
        s.pages[0]!,
        {
          ...s.pages[1]!,
          visibleWhen: {
            match: "all" as const,
            conditions: [{ fieldId: "b", op: "not_empty" as const }],
          },
        },
      ],
    };
    expect("problems" in parseFormSchema(own)).toBe(true);
  });
});

describe("building", () => {
  it("makes fields with new ids and usable defaults", () => {
    const f = newField("select", ["f_aaaaaa"]);
    expect(f.id).toMatch(/^f_[a-z0-9]{6}$/);
    expect(f.options).toHaveLength(1);
    expect(newField("file").file).toMatchObject({ maxMb: 10, maxFiles: 1 });
    expect(newField("consent")).toMatchObject({ required: true, consent: { kind: "custom" } });
  });

  it("offers comparisons that fit the answer", () => {
    expect(opsFor("yes_no")).toEqual([
      { op: "checked", label: "is yes" },
      { op: "equals", label: "is no", value: "false" },
    ]);
    expect(opsFor("file").map((o) => o.op)).toEqual(["not_empty", "empty"]);
    expect(opsFor("heading")).toEqual([]);
  });

  it("checks a file's type against the field", () => {
    const f = { file: { accept: ["application/pdf", "image/*"], maxMb: 10, maxFiles: 1 } };
    expect(fileAccepted(f, "application/pdf")).toBe(true);
    expect(fileAccepted(f, "IMAGE/PNG")).toBe(true);
    expect(fileAccepted(f, "text/html")).toBe(false);
    expect(fileAccepted({}, "text/html")).toBe(true);
  });

  it("reads posted answers: several checkboxes, file ids, the last value otherwise", () => {
    const form = new FormData();
    form.append("q_topics", "Design");
    form.append("q_topics", "Data");
    form.append(
      "q_cv",
      "11111111-1111-1111-1111-111111111111, 22222222-2222-2222-2222-222222222222",
    );
    form.append("q_agree", "");
    form.append("q_agree", "on");
    form.append("q_intro", "ignored");
    const raw = answersFromEntries(application, (n) => form.getAll(n));
    expect(raw).toMatchObject({
      topics: ["Design", "Data"],
      cv: {
        fileIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
      },
      agree: "on",
    });
    expect(raw).not.toHaveProperty("intro");
    expect(coerceAnswers(application, raw)).toMatchObject({ agree: true, name: null });
  });
});

describe("conditions", () => {
  const answers = {
    size: " 50+ ",
    topic: "Partnership",
    tags: ["AI", "climate"],
    n: "12",
    ok: "on",
    none: "",
  };

  it("keeps routing's semantics: trimmed, case-insensitive", () => {
    expect(conditionHolds({ fieldId: "size", op: "equals", value: "50+" }, answers)).toBe(true);
    expect(conditionHolds({ fieldId: "topic", op: "contains", value: "partner" }, answers)).toBe(
      true,
    );
    expect(conditionHolds({ fieldId: "topic", op: "contains", value: "" }, answers)).toBe(false);
    expect(conditionHolds({ fieldId: "topic", op: "not_equals", value: "reseller" }, answers)).toBe(
      true,
    );
    expect(conditionHolds({ fieldId: "none", op: "not_empty" }, answers)).toBe(false);
    expect(conditionHolds({ fieldId: "missing", op: "empty" }, answers)).toBe(true);
  });

  it("handles lists, numbers and checkboxes", () => {
    expect(conditionHolds({ fieldId: "tags", op: "equals", value: "ai" }, answers)).toBe(true);
    expect(conditionHolds({ fieldId: "size", op: "in", value: ["1-10", "50+"] }, answers)).toBe(
      true,
    );
    expect(conditionHolds({ fieldId: "n", op: "gt", value: 10 }, answers)).toBe(true);
    expect(conditionHolds({ fieldId: "n", op: "lt", value: 10 }, answers)).toBe(false);
    expect(conditionHolds({ fieldId: "none", op: "gt", value: -1 }, answers)).toBe(false);
    expect(conditionHolds({ fieldId: "ok", op: "checked" }, answers)).toBe(true);
  });

  it("groups: all, any, and empty always holds", () => {
    const a = { fieldId: "size", op: "equals" as const, value: "50+" };
    const b = { fieldId: "topic", op: "equals" as const, value: "nope" };
    expect(evaluate({ match: "all", conditions: [a, b] }, answers)).toBe(false);
    expect(evaluate({ match: "any", conditions: [a, b] }, answers)).toBe(true);
    expect(evaluate({ match: "all", conditions: [] }, answers)).toBe(true);
    expect(evaluate(undefined, answers)).toBe(true);
  });
});

describe("visibleFields and validateResponse", () => {
  it("shows conditional fields and pages only when their conditions hold", () => {
    expect(visibleFields(application, {}).map((f) => f.id)).toEqual([
      "intro",
      "name",
      "student",
      "cv",
    ]);
    expect(visibleFields(application, { name: "Ada", student: true }).map((f) => f.id)).toEqual([
      "intro",
      "name",
      "student",
      "school",
      "cv",
      "topics",
      "years",
      "agree",
      "access",
    ]);
  });

  it("requires only visible fields and drops hidden answers", () => {
    const r = validateResponse(application, {
      name: "Ada",
      student: "no",
      school: "Hidden U",
      agree: "on",
    });
    expect(r.errors).toEqual([]);
    expect(r.answers).toEqual({ name: "Ada", student: false, agree: true });
  });

  it("reports missing and malformed answers in plain words", () => {
    const r = validateResponse(application, {
      name: "Ada",
      student: "yes",
      topics: ["ai", "space"],
      years: "100",
    });
    expect(r.errors.map((e) => e.fieldId)).toEqual(["school", "topics", "years", "agree"]);
    expect(r.errors[0]!.message).toBe("Please answer: School");
    expect(r.errors[3]!.message).toBe("Please answer: Privacy notice");
  });

  it("keeps sensitive answers out of the response", () => {
    const r = validateResponse(application, {
      name: "Ada",
      agree: true,
      access: "Step-free access",
    });
    expect(r.answers).not.toHaveProperty("access");
    expect(r.sensitive).toEqual({ access: "Step-free access" });
    expect(toEventQuestions(application).map((q) => q.id)).not.toContain("access");
  });

  it("checks types", () => {
    const form: FormSchema = {
      v: 1,
      pages: [{ id: "p", fieldIds: ["e", "u", "d", "p2"] }],
      fields: [
        { id: "e", type: "email", label: "Email" },
        { id: "u", type: "url", label: "Site" },
        { id: "d", type: "date", label: "Start" },
        { id: "p2", type: "phone", label: "Phone" },
      ],
    };
    const r = validateResponse(form, { e: "nope", u: "ftp://x", d: "tomorrow", p2: "call me" });
    expect(r.errors.map((e) => e.fieldId)).toEqual(["e", "u", "d", "p2"]);
    expect(
      validateResponse(form, { e: "a@b.co", u: "https://a.co", d: "2026-11-01", p2: "+1 555 0100" })
        .errors,
    ).toEqual([]);
  });
});

describe("flattenAnswers", () => {
  it("turns answers into text by field id for emails and briefs", () => {
    expect(
      flattenAnswers(application, {
        name: "Ada",
        student: true,
        topics: ["ai", "climate"],
        years: 3,
        cv: { fileIds: ["f1"] },
      }),
    ).toEqual({ name: "Ada", student: "Yes", topics: "AI, Climate", years: "3", cv: "1 file" });
  });

  it("matches the old flat answers for migrated questions", () => {
    const schema = fromEventQuestions(legacy);
    expect(flattenAnswers(schema, { q1_topic: "Pricing", q2_size: "50+" })).toEqual({
      q1_topic: "Pricing",
      q2_size: "50+",
    });
  });
});

describe("sameSchema", () => {
  it("detects changes", () => {
    expect(sameSchema(fromEventQuestions(legacy), fromEventQuestions(legacy))).toBe(true);
    expect(sameSchema(fromEventQuestions(legacy), fromEventQuestions(legacy.slice(1)))).toBe(false);
    // A schema read back from jsonb has its keys in another order: still the same form.
    const reordered = JSON.parse(
      JSON.stringify(
        fromEventQuestions(legacy),
        Object.keys({ v: 0, fields: 0, pages: 0 })
          .concat(["id", "type", "label", "required", "options", "value", "fieldIds"])
          .reverse(),
      ),
    );
    expect(sameSchema(fromEventQuestions(legacy), reordered)).toBe(true);
  });
});
