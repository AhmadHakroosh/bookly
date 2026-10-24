import { coerceAnswers, type Answers, type FormSchema } from "@bookly/forms";

/*
 * What the public form renderer holds (raw inputs, uploads as their names) and how it maps to
 * typed answers and back. Plain functions, so server pages can prepare a resumed draft too.
 */

export type Uploaded = { id: string; name: string; size: number };
export type Raw = Record<string, string | string[] | Uploaded[]>;

/** What the renderer holds, as typed answers (files as their upload ids), for saving. */
export function answersOf(schema: FormSchema, raw: Raw) {
  return coerceAnswers(
    schema,
    Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [
        k,
        Array.isArray(v) && v.length && typeof v[0] === "object"
          ? { fileIds: (v as Uploaded[]).map((f) => f.id) }
          : v,
      ]),
    ),
  );
}

/** Saved answers back into what the renderer holds (a resumed draft, an edit). */
export function rawFrom(schema: FormSchema, answers: Answers, files: Uploaded[]): Raw {
  const out: Raw = {};
  for (const f of schema.fields) {
    const v = answers[f.id];
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v))
      out[f.id] = files.filter((x) => v.fileIds.includes(x.id));
    else if (typeof v === "boolean")
      out[f.id] = f.type === "yes_no" ? (v ? "yes" : "no") : v ? "on" : "";
    else if (Array.isArray(v)) out[f.id] = v;
    else out[f.id] = String(v);
  }
  return out;
}
