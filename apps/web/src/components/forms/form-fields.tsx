"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PaperclipIcon, XIcon } from "lucide-react";
import {
  answerName,
  evaluate,
  fileAccepted,
  isDisplayField,
  PUBLIC_FILE_MB,
  visibleFields,
  type Field,
  type FormSchema,
} from "@bookly/forms";
import { Dropdown } from "@/components/dropdown";
import { answersOf, type Raw, type Uploaded } from "./raw";

export { answersOf, rawFrom, type Raw, type Uploaded } from "./raw";

/*
 * The public renderer for a published form (ADR 0004): booking questions and routing forms
 * behind `forms_v2`. Questions show and hide as people answer, with the same evaluator the
 * server validates with; hidden questions post nothing. Answers post as `q_<id>` (several for
 * checkboxes, comma-separated file ids for uploads) inside the page's own <form>, with the
 * draft's token as `form_token` once a file was uploaded.
 */

const input =
  "bg-background h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";

export function FormFields({
  formId,
  schema,
  /** How a question is introduced to agents filling the form (WebMCP). */
  toolPrefix = "The question",
  preview = false,
  initial,
  initialToken = null,
  onChange,
  onToken,
  pages,
  draftToken,
  errors,
  uploadContext,
}: {
  formId: string;
  schema: FormSchema;
  toolPrefix?: string;
  /** The builder's preview: everything but uploads works. */
  preview?: boolean;
  /** Answers to start from (a resumed draft or an edit). */
  initial?: Raw;
  /** A draft's token to start from, so uploads join it. */
  initialToken?: string | null;
  /** Every change, for callers that save as people type (applications). */
  onChange?: (raw: Raw) => void;
  /** The draft's token, once an upload started one. */
  onToken?: (token: string) => void;
  /** Only these pages show (one section of a long form at a time); the rest stay mounted. */
  pages?: string[];
  /** A draft token the caller got by saving, so later uploads join that draft. */
  draftToken?: string | null;
  /** Messages under questions, by field id, from the caller's check. */
  errors?: Record<string, string>;
  /** Sent with each upload's start (an application edit sends its status token). */
  uploadContext?: Record<string, string>;
}) {
  const [raw, setRaw] = useState<Raw>(initial ?? {});
  const [token, setToken] = useState<string | null>(initialToken);
  useEffect(() => {
    onChange?.(raw);
  }, [raw, onChange]);
  useEffect(() => {
    if (draftToken) tokenRef.current = draftToken;
  }, [draftToken]);
  // Uploads run one after another, so the first one's draft (and token) is shared by all.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const tokenRef = useRef<string | null>(initialToken);

  const typed = useMemo(() => answersOf(schema, raw), [raw, schema]);
  const visible = new Set(visibleFields(schema, typed).map((f) => f.id));
  const byId = new Map(schema.fields.map((f) => [f.id, f]));
  const set = (id: string, v: Raw[string]) => setRaw((r) => ({ ...r, [id]: v }));
  const filesOf = (r: Raw, id: string) => (Array.isArray(r[id]) ? (r[id] as Uploaded[]) : []);
  const addFile = (id: string, f: Uploaded) =>
    setRaw((r) => ({ ...r, [id]: [...filesOf(r, id), f] }));

  const upload = (fieldId: string, file: File) => {
    const run = queue.current.then(async () => {
      const headers = (t: string | null): Record<string, string> =>
        t ? { "x-form-token": t } : {};
      const start = await fetch(`/api/forms/${formId}/uploads`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers(tokenRef.current) },
        body: JSON.stringify({
          fieldId,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          ...uploadContext,
        }),
      });
      const ticket = await start.json().catch(() => ({}));
      if (!start.ok) throw new Error(ticket.error ?? "The upload did not start.");
      tokenRef.current = ticket.token;
      setToken(ticket.token);
      onToken?.(ticket.token);
      const put = await fetch(ticket.upload.url, {
        method: "PUT",
        headers: ticket.upload.headers,
        body: file,
      });
      if (!put.ok) throw new Error("The upload did not finish. Please try again.");
      const done = await fetch(`/api/forms/${formId}/uploads/${ticket.id}/complete`, {
        method: "POST",
        headers: headers(ticket.token),
      });
      const ready = await done.json().catch(() => ({}));
      if (!done.ok) throw new Error(ready.error ?? "The upload did not finish.");
      return ready as Uploaded;
    });
    queue.current = run.catch(() => {});
    return run;
  };

  const remove = async (fieldId: string, f: Uploaded) => {
    setRaw((r) => ({ ...r, [fieldId]: filesOf(r, fieldId).filter((x) => x.id !== f.id) }));
    await fetch(`/api/forms/${formId}/uploads/${f.id}`, {
      method: "DELETE",
      headers: tokenRef.current ? { "x-form-token": tokenRef.current } : {},
    }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      {token && <input type="hidden" name="form_token" value={token} />}
      {schema.pages
        .filter((p) => evaluate(p.visibleWhen, typed))
        .map((p) => (
          <div key={p.id} className="space-y-4" hidden={!!pages && !pages.includes(p.id)}>
            {p.title && <h2 className="pt-2 text-base font-semibold">{p.title}</h2>}
            {p.fieldIds
              .filter((id) => visible.has(id))
              .map((id) => byId.get(id)!)
              .map((f) => (
                // Anchored, so an error summary can link to the question.
                <div key={f.id} id={`q-${f.id}`} className="scroll-mt-24">
                  <Question
                    field={f}
                    value={raw[f.id]}
                    onChange={(v) => set(f.id, v)}
                    toolPrefix={toolPrefix}
                    upload={(file) => upload(f.id, file)}
                    add={(file) => addFile(f.id, file)}
                    preview={preview}
                    remove={(file) => remove(f.id, file)}
                    error={errors?.[f.id]}
                  />
                </div>
              ))}
          </div>
        ))}
    </div>
  );
}

function Title({ f, htmlFor }: { f: Field; htmlFor?: string }) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <Tag htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {f.label}
      {!f.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
    </Tag>
  );
}

function Question({
  field: f,
  value,
  onChange,
  toolPrefix,
  upload,
  add,
  remove,
  preview,
  error,
}: {
  field: Field;
  preview: boolean;
  error?: string;
  value: Raw[string] | undefined;
  onChange: (v: Raw[string]) => void;
  toolPrefix: string;
  upload: (file: File) => Promise<Uploaded>;
  add: (file: Uploaded) => void;
  remove: (file: Uploaded) => Promise<void>;
}) {
  const id = useId();
  // The help and any error both describe the field; the error comes first.
  const helpId = f.help || error ? `${id}-help` : undefined;
  const name = answerName(f.id);
  const text = typeof value === "string" ? value : "";
  const tool = `${toolPrefix}: ${f.label}`;
  const help = (f.help || error) && (
    <div id={helpId} className="mt-1 space-y-0.5 text-xs">
      {error && <p className="font-medium text-destructive">{error}</p>}
      {f.help && <p className="text-muted-foreground">{f.help}</p>}
    </div>
  );

  if (isDisplayField(f.type))
    return f.type === "heading" ? (
      <h3 className="pt-2 text-sm font-semibold">{f.label}</h3>
    ) : (
      <p className="text-sm whitespace-pre-line text-muted-foreground">{f.label}</p>
    );

  switch (f.type) {
    case "long_text":
      return (
        <div>
          <Title f={f} htmlFor={id} />
          <textarea
            id={id}
            name={name}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            required={f.required}
            rows={3}
            maxLength={f.validation?.maxLength}
            aria-describedby={helpId}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            toolparamdescription={tool}
          />
          {help}
        </div>
      );
    case "select":
      return (
        <div>
          <Title f={f} />
          <Dropdown
            name={name}
            value={text || undefined}
            onValueChange={onChange}
            required={f.required}
            className="h-10"
            ariaLabel={f.label}
            options={(f.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
            toolparamdescription={`${tool}. One of: ${(f.options ?? []).map((o) => o.label).join(", ")}.`}
          />
          {help}
        </div>
      );
    case "multi_select": {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset aria-describedby={helpId}>
          <legend className="mb-1 block text-sm font-medium">
            {f.label}
            {!f.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
          </legend>
          <div className="space-y-1.5">
            {(f.options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  value={o.value}
                  checked={chosen.includes(o.value)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...chosen, o.value] : chosen.filter((x) => x !== o.value),
                    )
                  }
                />
                {o.label}
              </label>
            ))}
          </div>
          {help}
        </fieldset>
      );
    }
    case "yes_no":
      return (
        <fieldset aria-describedby={helpId}>
          <legend className="mb-1 block text-sm font-medium">
            {f.label}
            {!f.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
          </legend>
          <div className="flex gap-4">
            {(["yes", "no"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={name}
                  value={v}
                  checked={text === v}
                  required={f.required}
                  onChange={() => onChange(v)}
                />
                {v === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
          {help}
        </fieldset>
      );
    case "checkbox":
    case "consent":
      return (
        <div>
          {f.type === "consent" && f.consent?.text && (
            <p className="mb-2 rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-line text-muted-foreground">
              {f.consent.text}
              {f.consent.url && (
                <>
                  {" "}
                  <a href={f.consent.url} target="_blank" rel="noreferrer" className="underline">
                    Read more
                  </a>
                </>
              )}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value="on"
              checked={text === "on"}
              required={f.required}
              aria-describedby={helpId}
              onChange={(e) => onChange(e.target.checked ? "on" : "")}
              className="mt-0.5"
            />
            <span>
              {f.label}
              {!f.required && <span className="text-muted-foreground"> (optional)</span>}
            </span>
          </label>
          {help}
        </div>
      );
    case "file":
      return (
        <FileQuestion
          field={f}
          files={Array.isArray(value) ? (value as Uploaded[]) : []}
          add={add}
          preview={preview}
          upload={upload}
          remove={remove}
          helpId={helpId}
          help={help}
          tool={tool}
        />
      );
    default:
      return (
        <div>
          <Title f={f} htmlFor={id} />
          <input
            id={id}
            name={name}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            type={
              f.type === "email"
                ? "email"
                : f.type === "phone"
                  ? "tel"
                  : f.type === "url"
                    ? "url"
                    : f.type === "number"
                      ? "number"
                      : f.type === "date"
                        ? "date"
                        : "text"
            }
            min={f.validation?.min}
            max={f.validation?.max}
            maxLength={f.validation?.maxLength}
            required={f.required}
            aria-describedby={helpId}
            className={input}
            toolparamdescription={tool}
          />
          {help}
        </div>
      );
  }
}

function FileQuestion({
  field: f,
  files,
  add,
  upload,
  remove,
  helpId,
  help,
  tool,
  preview,
}: {
  field: Field;
  preview: boolean;
  files: Uploaded[];
  add: (file: Uploaded) => void;
  upload: (file: File) => Promise<Uploaded>;
  remove: (file: Uploaded) => Promise<void>;
  helpId?: string;
  help: React.ReactNode;
  tool: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = f.file?.maxFiles ?? 1;
  const maxMb = Math.min(f.file?.maxMb ?? PUBLIC_FILE_MB, PUBLIC_FILE_MB);
  const pick = async (list: FileList | null) => {
    setError(null);
    const chosen = [...(list ?? [])].slice(0, Math.max(0, max - files.length));
    for (const file of chosen) {
      if (!fileAccepted(f, file.type || "application/octet-stream"))
        return setError(`${file.name}: that type of file is not accepted here.`);
      if (file.size > maxMb * 1024 ** 2)
        return setError(`${file.name}: files can be up to ${maxMb} MB.`);
    }
    setBusy(true);
    try {
      for (const file of chosen) {
        add(await upload(file));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Title f={f} htmlFor={id} />
      <input type="hidden" name={answerName(f.id)} value={files.map((x) => x.id).join(",")} />
      {files.length > 0 && (
        <ul className="mb-2 space-y-1">
          {files.map((x) => (
            <li
              key={x.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
            >
              <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <button
                type="button"
                onClick={() => remove(x)}
                aria-label={`Remove ${x.name}`}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < max && (
        <input
          id={id}
          type="file"
          multiple={max - files.length > 1}
          accept={f.file?.accept.join(",") || undefined}
          disabled={busy || preview}
          // Required is checked on the server: the chosen file is posted as its upload id.
          aria-required={f.required && !files.length}
          aria-describedby={helpId}
          onChange={(e) => {
            void pick(e.target.files);
            e.target.value = "";
          }}
          className="block w-full text-sm file:me-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          toolparamdescription={`${tool}. A file upload; agents cannot attach files, leave it to the guest.`}
        />
      )}
      <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
        {preview
          ? "Uploads work on the live form."
          : busy
            ? "Uploading…"
            : `Up to ${max === 1 ? "one file" : `${max} files`}, ${maxMb} MB each.`}
      </p>
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {help}
    </div>
  );
}
