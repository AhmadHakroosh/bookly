"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { evaluate, flattenAnswers, validateResponse, type FormSchema } from "@bookly/forms";
import {
  resumeLinkAction,
  saveDraftAction,
  submitAction,
} from "@/app/(public)/apply/[slug]/actions";
import { saveEditAction } from "@/app/(public)/applications/[token]/actions";
import { answersOf, FormFields, type Raw } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { COPY } from "@/server/hiring/apply-text";

/*
 * P2–P4 of the application page (planning/v2/ux/application-page.md): the form one section at a
 * time with its progress, autosave once the candidate has given an email ("Saved 10:42"), Save
 * and finish later, the adjustments question before the end (never first), and Review and
 * submit with the privacy notice, consent and a focused error summary that links to each
 * answer. In edit mode (a submitted application, ADR 0003) the same form saves a new revision.
 */

type Step =
  | { kind: "section"; pageIds: string[]; title: string }
  | { kind: "adjustments" }
  | { kind: "review" };

export function ApplyForm({
  mode,
  slug,
  statusToken,
  formId,
  schema,
  workspaceName,
  initial,
  askAccommodations,
  notice,
  preview,
  emailFieldId,
  title,
}: {
  title: string;
  mode: "apply" | "edit";
  slug: string;
  /** Edit mode: the application's status token. */
  statusToken?: string;
  formId: string;
  schema: FormSchema;
  workspaceName: string;
  initial?: { token: string | null; raw: Raw; section?: number };
  askAccommodations: boolean;
  notice: string;
  preview: boolean;
  emailFieldId: string | null;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState<Raw>(initial?.raw ?? {});
  const [token, setToken] = useState<string | null>(initial?.token ?? null);
  const [step, setStep] = useState(initial?.section ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [saved, setSaved] = useState<{ at: string } | { failed: true } | null>(null);
  const [notice2, setNotice2] = useState<string | null>(null);
  const [needs, setNeeds] = useState<"yes" | "no" | "">("");
  const [adjustments, setAdjustments] = useState("");
  const [consent, setConsent] = useState(false);
  const [future, setFuture] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const typed = useMemo(() => answersOf(schema, raw), [schema, raw]);
  const steps: Step[] = useMemo(() => {
    const pages = schema.pages.filter((p) => evaluate(p.visibleWhen, typed));
    return [
      ...pages.map((p, i) => ({
        kind: "section" as const,
        pageIds: [p.id],
        title: p.title || (i === 0 ? "About you" : `Section ${i + 1}`),
      })),
      ...(askAccommodations && mode === "apply" ? [{ kind: "adjustments" as const }] : []),
      { kind: "review" as const },
    ];
  }, [schema, typed, askAccommodations, mode]);
  const current = steps[Math.min(step, steps.length - 1)]!;
  const sectionOf = useCallback(
    (fieldId: string) =>
      steps.findIndex(
        (s) =>
          s.kind === "section" &&
          schema.pages.some((p) => s.pageIds.includes(p.id) && p.fieldIds.includes(fieldId)),
      ),
    [steps, schema],
  );

  // Moving between sections takes focus to the new heading; arriving on the page doesn't.
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  /* ---------- Autosave (apply mode): once there is an email or a draft ---------- */
  const email = emailFieldId ? String(typed[emailFieldId] ?? "") : "";
  const canSave =
    mode === "apply" && !preview && (!!token || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const latest = useRef({ raw, token });
  useEffect(() => {
    latest.current = { raw, token };
  });
  const save = useCallback(async (): Promise<string | null> => {
    const { raw: r, token: t } = latest.current;
    const res = await saveDraftAction(slug, t, answersOf(schema, r));
    if ("error" in res) {
      setSaved({ failed: true });
      return t;
    }
    if (!t) {
      latest.current.token = res.token;
      setToken(res.token);
    }
    setSaved({
      at: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
        new Date(res.savedAt),
      ),
    });
    return res.token;
  }, [slug, schema]);
  useEffect(() => {
    if (!canSave) return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
  }, [raw, canSave, save]);

  /* ---------- Steps ---------- */
  const check = (s: Step) => {
    if (s.kind !== "section") return {};
    const ids = new Set(
      schema.pages.filter((p) => s.pageIds.includes(p.id)).flatMap((p) => p.fieldIds),
    );
    return Object.fromEntries(
      validateResponse(schema, typed)
        .errors.filter((e) => ids.has(e.fieldId))
        .map((e) => [e.fieldId, e.message]),
    );
  };
  const next = () => {
    const e = check(current);
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`q-${Object.keys(e)[0]}`)?.scrollIntoView({ block: "center" });
      return;
    }
    if (canSave) void save();
    setStep((i) => Math.min(i + 1, steps.length - 1));
  };
  const goTo = (fieldId: string) => {
    const i = sectionOf(fieldId);
    if (i >= 0) setStep(i);
    requestAnimationFrame(() =>
      document.getElementById(`q-${fieldId}`)?.scrollIntoView({ block: "center" }),
    );
  };

  const submit = () =>
    start(async () => {
      setNotice2(null);
      const all = Object.fromEntries(
        validateResponse(schema, typed).errors.map((e) => [e.fieldId, e.message]),
      );
      if (mode === "apply" && !consent) all.consent = "Agree to the privacy notice to apply.";
      if (Object.keys(all).length) return fail(all);
      if (preview) return setNotice2(COPY.previewBanner);
      if (mode === "edit") {
        const r = await saveEditAction(statusToken!, token, answersOf(schema, raw));
        if ("error" in r) return setNotice2(r.error);
        if (!r.ok) return fail(r.errors);
        router.push(`/applications/${statusToken}?updated=1`);
        return;
      }
      const r = await submitAction(slug, {
        token,
        answers: answersOf(schema, raw),
        accommodations: needs === "yes" ? adjustments : "",
        consent,
        futureContact: future,
      });
      if ("error" in r) return setNotice2(r.error);
      if (r.ok) return router.push(`/applications/${r.statusToken}?new=1`);
      if ("duplicate" in r) return setDone(COPY.already(title, r.email));
      fail(r.errors);
    });
  const fail = (e: Record<string, string>) => {
    setErrors(e);
    setSummary(Object.keys(e));
    setShown((n) => n + 1);
  };
  // The summary takes focus once it is on screen (submit runs in a transition).
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown) summaryRef.current?.focus();
  }, [shown]);
  const labelOf = (id: string) =>
    id === "consent"
      ? "Privacy notice"
      : id === "files"
        ? "Documents"
        : (schema.fields.find((f) => f.id === id)?.label ?? id);

  if (done)
    return (
      <div role="status" className="rounded-xl border bg-card p-5 text-sm">
        {done}
      </div>
    );

  const sections = steps.filter((s) => s.kind === "section").length;
  const position = steps.indexOf(current) + 1;
  const flat = flattenAnswers(schema, typed);
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {current.kind === "section"
            ? `Section ${position} of ${sections}`
            : current.kind === "adjustments"
              ? "Adjustments and access"
              : "Review and submit"}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(position / steps.length) * 100}%` }}
          />
        </div>
        <h2 ref={heading} tabIndex={-1} className="pt-2 text-lg font-semibold outline-none">
          {current.kind === "section"
            ? current.title
            : current.kind === "adjustments"
              ? "Adjustments and access"
              : mode === "edit"
                ? "Review your changes"
                : "Review and submit"}
        </h2>
      </div>

      {summary.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm outline-none"
        >
          <p className="font-medium text-destructive">{COPY.errorSummary(summary.length)}</p>
          <ul className="mt-1 list-disc ps-5">
            {summary.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className="text-start underline underline-offset-2"
                  onClick={() => goTo(id)}
                >
                  {labelOf(id)}: {errors[id]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* One renderer for every section (the others stay mounted, hidden), so answers and
          uploads survive moving around. */}
      <FormFields
        formId={formId}
        schema={schema}
        pages={current.kind === "section" ? current.pageIds : []}
        initial={initial?.raw}
        initialToken={mode === "apply" ? (initial?.token ?? null) : null}
        draftToken={token}
        onChange={setRaw}
        onToken={setToken}
        errors={errors}
        preview={preview}
        toolPrefix="The application question"
      />

      {current.kind === "adjustments" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{COPY.adjustmentsQuestion}</legend>
          <div className="flex gap-4 text-sm">
            {(["no", "yes"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="needs"
                  value={v}
                  checked={needs === v}
                  onChange={() => setNeeds(v)}
                />
                {v === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
          {needs === "yes" && (
            <div>
              <label htmlFor="adjustments" className="mb-1 block text-sm font-medium">
                What would help?
              </label>
              <textarea
                id="adjustments"
                rows={4}
                maxLength={4000}
                value={adjustments}
                aria-describedby="adjustments-help"
                onChange={(e) => setAdjustments(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          <p id="adjustments-help" className="text-xs text-muted-foreground">
            {COPY.adjustmentsHelp}
          </p>
        </fieldset>
      )}

      {current.kind === "review" && (
        <div className="space-y-5">
          {steps
            .filter((s): s is Extract<Step, { kind: "section" }> => s.kind === "section")
            .map((s) => {
              const fields = schema.pages
                .filter((p) => s.pageIds.includes(p.id))
                .flatMap((p) => p.fieldIds)
                .map((id) => schema.fields.find((f) => f.id === id)!)
                .filter((f) => f && flat[f.id]);
              return (
                <section key={s.pageIds.join()} className="rounded-xl border bg-card p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{s.title}</h3>
                    <Button size="sm" variant="ghost" onClick={() => setStep(steps.indexOf(s))}>
                      Edit<span className="sr-only"> {s.title}</span>
                    </Button>
                  </div>
                  <dl className="mt-2 space-y-2">
                    {fields.map((f) => (
                      <div key={f.id}>
                        <dt className="text-xs text-muted-foreground">{f.label}</dt>
                        <dd className="break-words whitespace-pre-line">
                          {typeof raw[f.id] === "object" &&
                          Array.isArray(raw[f.id]) &&
                          typeof (raw[f.id] as unknown[])[0] === "object"
                            ? (raw[f.id] as { name: string }[]).map((x) => x.name).join(", ")
                            : flat[f.id]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          {mode === "apply" && (
            <>
              <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
                <h3 className="font-semibold">Privacy</h3>
                <p className="text-muted-foreground">{notice.split("\n\n")[0]}</p>
                <details>
                  <summary className="cursor-pointer text-primary underline-offset-2 hover:underline">
                    Read the full notice
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-muted-foreground">{notice}</p>
                </details>
                <p>{COPY.sixteen}</p>
              </section>
              <div className="space-y-3 text-sm">
                <label id="q-consent" className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    aria-describedby={errors.consent ? "consent-error" : undefined}
                    className="mt-0.5"
                  />
                  <span>{COPY.consent(workspaceName)}</span>
                </label>
                {errors.consent && (
                  <p id="consent-error" className="text-xs font-medium text-destructive">
                    {errors.consent}
                  </p>
                )}
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={future}
                    onChange={(e) => setFuture(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {COPY.consentFuture(workspaceName)}{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </span>
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {notice2 && (
        <p role="alert" className="rounded-lg bg-muted px-3 py-2 text-sm">
          {notice2}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((i) => i - 1)}>
            Back
          </Button>
        )}
        <span role="status" className="me-auto text-xs text-muted-foreground">
          {saved && "failed" in saved
            ? "We couldn't save your last change. We'll keep trying. Don't close this page yet."
            : saved
              ? `Saved ${saved.at}`
              : ""}
        </span>
        {mode === "apply" && !preview && <ResumeLater slug={slug} canSave={canSave} save={save} />}
        {current.kind === "review" ? (
          <Button variant="ink" size="lg" disabled={pending} onClick={submit} aria-busy={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? "Submitting…" : mode === "edit" ? "Save changes" : COPY.submit}
          </Button>
        ) : (
          <Button variant="ink" onClick={next}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

function ResumeLater({
  slug,
  canSave,
  save,
}: {
  slug: string;
  canSave: boolean;
  save: () => Promise<string | null>;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="link"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (!canSave) return setMsg("Enter your email first, so we can send you the link.");
            const t = await save();
            if (!t) return setMsg("Enter your email first, so we can send you the link.");
            const r = await resumeLinkAction(slug, t);
            setMsg("error" in r ? r.error : COPY.resumeSent(r.sentTo));
          })
        }
      >
        {COPY.saveLater}
      </Button>
      {msg && (
        <p role="status" className="basis-full text-sm">
          {msg}
        </p>
      )}
    </>
  );
}
