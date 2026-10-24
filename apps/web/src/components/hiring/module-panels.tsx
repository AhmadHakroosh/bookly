"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { FILE_ACCEPT } from "@bookly/forms";
import type { RuleAction } from "@bookly/db/schema";
import {
  deleteMessageAction,
  saveMessageAction,
  saveModuleAction,
  saveRuleAction,
} from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Dropdown } from "@/components/dropdown";
import { NumberField } from "@/components/number-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ModuleKind, StageModuleConfigs } from "@/server/pipelines/modules";
import { isFinal, type SetupStage } from "@/server/hiring/setup-text";

/*
 * S4: one panel per module on a stage. Each says what the module does here, takes its settings
 * and says what the applicant sees (mirrored in the preview). Saving goes through the server,
 * which checks the config against the module registry (ADR 0002).
 */

export type PanelData = {
  oppId: string;
  stage: SetupStage;
  stages: SetupStage[];
  formId: string | null;
  formFields: { id: string; label: string; type: string }[];
  eventTypes: { value: string; label: string }[];
  scorecards: { id: string; name: string; criteria: number }[];
  forms: { id: string; name: string; purpose: string }[];
  readOnly: boolean;
};

/** A save that reports its own error and "Saved". */
export function useSave() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  const run = (fn: () => Promise<{ error?: string } | { problems?: string[] } | undefined>) =>
    start(async () => {
      const r = await fn();
      const msg =
        r && "error" in r && r.error
          ? r.error
          : r && "problems" in r && r.problems?.length
            ? r.problems.join(" ")
            : null;
      setError(msg);
      if (!msg) setSaved(Date.now());
    });
  return { pending, error, saved, run };
}

export function SaveRow({
  save,
  onSave,
  label = "Save",
  disabled,
}: {
  save: ReturnType<typeof useSave>;
  onSave: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <span role="status" className="mr-auto text-xs">
        {save.error ? (
          <span className="text-destructive">{save.error}</span>
        ) : save.saved ? (
          <span className="text-muted-foreground">Saved.</span>
        ) : null}
      </span>
      <Button size="sm" variant="outline" disabled={save.pending || disabled} onClick={onSave}>
        {save.pending && <Spinner data-icon="inline-start" />}
        {label}
      </Button>
    </div>
  );
}

function Applicant({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">What applicants see: </span>
      {children}
    </p>
  );
}

const label = "mb-1 block text-xs font-medium";

export function ModulePanel({ kind, data }: { kind: ModuleKind; data: PanelData }) {
  switch (kind) {
    case "forms":
      return <FormsPanel data={data} />;
    case "reviews":
      return <ReviewsPanel data={data} />;
    case "scheduling":
      return <SchedulingPanel data={data} />;
    case "video":
      return <VideoPanel data={data} />;
    case "messages":
      return <MessagesPanel data={data} />;
    case "tasks":
      return <TasksPanel data={data} />;
    case "files":
      return <FilesPanel data={data} />;
    case "payments":
      return <PaymentsPanel data={data} />;
    case "routing":
      return <RoutingPanel data={data} />;
    case "decisions":
      return <DecisionsPanel data={data} />;
  }
}

/* ---------------- Forms ---------------- */

function FormsPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const current = stage.modules.forms ?? { v: 1 as const, enabled: true, forms: [] };
  const [rows, setRows] = useState(
    current.forms.filter((f) => !stage.isEntry || f.formId !== data.formId),
  );
  const options = data.forms
    .filter((f) => f.id !== data.formId)
    .map((f) => ({ value: f.id, label: f.name }));
  return (
    <div className="space-y-4">
      {stage.isEntry ? (
        <div className="space-y-2">
          <p className="text-sm">
            The application form: {data.formFields.length} question
            {data.formFields.length === 1 ? "" : "s"}. Forms offer no calculated or quiz-style
            scoring.
          </p>
          {data.formId && !data.readOnly && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/admin/forms/${data.formId}`} />}
            >
              Edit application form
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm">
          Ask applicants for a follow-up form, or ask a referee for a reference.
        </p>
      )}
      {(!stage.isEntry || rows.length > 0) && (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <span className={label}>Form</span>
                <Dropdown
                  ariaLabel="Form"
                  value={r.formId}
                  options={options}
                  onValueChange={(v) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, formId: v } : x)))
                  }
                />
              </div>
              <div className="w-40">
                <span className={label}>Filled in by</span>
                <Dropdown
                  ariaLabel="Filled in by"
                  value={r.audience}
                  options={[
                    { value: "subject", label: "The applicant" },
                    { value: "reference", label: "A referee" },
                  ]}
                  onValueChange={(v) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i ? { ...x, audience: v as "subject" | "reference" } : x,
                      ),
                    )
                  }
                />
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Remove form"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!data.readOnly && (
        <div className="flex flex-wrap gap-2">
          {options.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setRows([
                  ...rows,
                  { formId: options[0]!.value, audience: "subject", required: false },
                ])
              }
            >
              <PlusIcon data-icon="inline-start" />
              Add a form
            </Button>
          )}
        </div>
      )}
      {!stage.isEntry && options.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No follow-up forms yet. Templates add an acceptance or reference form where they need one.
        </p>
      )}
      {!data.readOnly && (!stage.isEntry || rows.length > 0) && (
        <SaveRow
          save={save}
          onSave={() =>
            save.run(() =>
              saveModuleAction(data.oppId, stage.id, "forms", {
                ...current,
                forms: [
                  ...current.forms.filter((f) => stage.isEntry && f.formId === data.formId),
                  ...rows,
                ],
              }),
            )
          }
        />
      )}
      <Applicant>
        {stage.isEntry
          ? "the form on the application page."
          : "a task on their status page, with a link to the form."}
      </Applicant>
    </div>
  );
}

/* ---------------- Reviews ---------------- */

function ReviewsPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const r = stage.modules.reviews!;
  const [v, setV] = useState(r);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Scorecard</span>
          <Dropdown
            ariaLabel="Scorecard"
            value={v.scorecardId ?? ""}
            placeholder="Choose a scorecard"
            options={data.scorecards.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.criteria} criteria)`,
            }))}
            onValueChange={(x) => setV({ ...v, scorecardId: x || null })}
          />
        </div>
        <div>
          <span className={label}>Reviewers per application</span>
          <NumberField
            ariaLabel="Reviewers per application"
            min={1}
            max={20}
            value={v.reviewersPerApplication}
            onValueChange={(x) => setV({ ...v, reviewersPerApplication: x ?? 1 })}
          />
        </div>
        <div>
          <span className={label}>Assignment</span>
          <Dropdown
            ariaLabel="Assignment"
            value={v.assignment}
            options={[
              { value: "round_robin", label: "Spread evenly across reviewers" },
              { value: "whole_pool", label: "Every reviewer on the team" },
              { value: "manual", label: "A coordinator assigns" },
              { value: "routing", label: "The pool Routing chose" },
            ]}
            onValueChange={(x) => setV({ ...v, assignment: x as typeof v.assignment })}
          />
        </div>
        <div>
          <span className={label}>Due after entering (days)</span>
          <NumberField
            ariaLabel="Due after entering, in days"
            min={1}
            max={90}
            value={v.dueDays}
            placeholder="No due date"
            onValueChange={(x) => setV({ ...v, dueDays: x })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={v.interviewersReview}
          onCheckedChange={(x) => setV({ ...v, interviewersReview: !!x })}
        />
        Interviewers fill in the scorecard after the interview
      </label>
      <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <LockIcon className="size-3.5" aria-hidden /> Anonymised review
        </span>
        <span className="rounded-full border px-2 py-0.5 text-xs">Enterprise</span>
      </div>
      {!data.readOnly && (
        <SaveRow
          save={save}
          onSave={() => save.run(() => saveModuleAction(data.oppId, stage.id, "reviews", v))}
        />
      )}
      <Applicant>nothing. Reviews are never shown to applicants.</Applicant>
    </div>
  );
}

/* ---------------- Scheduling ---------------- */

function SchedulingPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const s = stage.modules.scheduling!;
  const [eventTypeId, setEventTypeId] = useState(s.sessions[0]?.eventTypeId ?? "");
  const sendsLink = stage.rules.some((r) => r.actions.some((a) => a.type === "send_booking_link"));
  const [send, setSend] = useState(sendsLink || !s.sessions.length);
  return (
    <div className="space-y-4">
      {s.suggested && !s.sessions.length && (
        <p className="text-sm">
          The template suggests a {s.suggested.minutes}-minute {s.suggested.title.toLowerCase()}.
          Choose an event type to send booking links.
        </p>
      )}
      <div>
        <span className={label}>Event type</span>
        {data.eventTypes.length ? (
          <Dropdown
            ariaLabel="Event type"
            value={eventTypeId}
            placeholder="Choose an event type"
            options={data.eventTypes}
            onValueChange={setEventTypeId}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No event types yet.{" "}
            <Link href="/admin/event-types" className="underline underline-offset-2">
              Create one
            </Link>{" "}
            for interviews, then come back.
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={send} onCheckedChange={(x) => setSend(!!x)} />
        Send the booking link when an application enters this stage
      </label>
      {!data.readOnly && (
        <SaveRow
          save={save}
          disabled={!eventTypeId}
          onSave={() =>
            save.run(async () => {
              const r = await saveModuleAction(data.oppId, stage.id, "scheduling", {
                ...s,
                sessions: [
                  { eventTypeId, mode: "self_schedule", hosts: "pool" },
                  ...s.sessions.slice(1).filter((x) => x.eventTypeId !== eventTypeId),
                ],
              });
              if (r.error || !send || sendsLink) return r;
              return saveRuleAction(data.oppId, stage.id, null, {
                name: "Send the booking link",
                on: "enter",
                tag: "",
                actions: [{ type: "send_booking_link", sessionIndex: 0 }],
              });
            })
          }
        />
      )}
      <Applicant>
        &ldquo;Book your interview&rdquo; on their status page and an email with the link.
      </Applicant>
    </div>
  );
}

/* ---------------- Video ---------------- */

function VideoPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const v = stage.modules.video!;
  const [capture, setCapture] = useState(v.autoCapture ?? "off");
  return (
    <div className="space-y-4">
      <div>
        <span className={label}>Capture</span>
        <Dropdown
          ariaLabel="Capture"
          value={capture}
          options={[
            { value: "off", label: "Don't capture" },
            { value: "ask", label: "Ask at the start of each interview" },
            { value: "always", label: "Capture every interview, with the applicant's consent" },
          ]}
          onValueChange={(x) => setCapture(x as typeof capture)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Recaps need an AI key; without one, captures keep the transcript only. Nothing about
          recaps is shown to applicants.
        </p>
      </div>
      {!data.readOnly && (
        <SaveRow
          save={save}
          onSave={() =>
            save.run(() =>
              saveModuleAction(data.oppId, stage.id, "video", { ...v, autoCapture: capture }),
            )
          }
        />
      )}
      <Applicant>a consent prompt at the interview when capture is on.</Applicant>
    </div>
  );
}

/* ---------------- Messages ---------------- */

function MessagesPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const final = isFinal(stage.category);
  const templates = stage.modules.messages?.templates ?? [];
  const whenOf = (tid: string): "enter" | "leave" =>
    stage.rules.find((r) =>
      r.actions.some((a) => a.type === "send_message" && a.templateId === tid),
    )?.trigger.on === "leave"
      ? "leave"
      : "enter";
  const [editing, setEditing] = useState<string | "new" | null>(null);
  // A stage without a message opens straight on a new one (also after deleting the last).
  const adding = editing === "new" || !templates.length;
  return (
    <div className="space-y-4">
      {final && (
        <p className="flex items-start gap-2 rounded-lg bg-accent px-3 py-2 text-sm">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Sent when you release decisions. You&apos;ll review every message before it goes out.
        </p>
      )}
      <ul className="space-y-2">
        {templates.map((t) =>
          editing === t.id ? (
            <li key={t.id}>
              <MessageEditor
                data={data}
                initial={{ templateId: t.id, subject: t.subject, body: t.body, when: whenOf(t.id) }}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {final
                    ? "At decision release"
                    : whenOf(t.id) === "leave"
                      ? "When they leave"
                      : "When they enter"}
                </p>
              </div>
              {!data.readOnly && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t.id)}>
                    Edit
                  </Button>
                  <DeleteMessage data={data} templateId={t.id} subject={t.subject} />
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      {adding && !data.readOnly ? (
        <MessageEditor
          data={data}
          initial={{ templateId: null, subject: "", body: "", when: "enter" }}
          onDone={() => setEditing(null)}
        />
      ) : (
        !data.readOnly && (
          <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            Add message
          </Button>
        )
      )}
      <Applicant>the emails themselves. Replies land in one conversation with your team.</Applicant>
    </div>
  );
}

function DeleteMessage({
  data,
  templateId,
  subject,
}: {
  data: PanelData;
  templateId: string;
  subject: string;
}) {
  const save = useSave();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Delete "${subject}"`}
      disabled={save.pending}
      title={save.error ?? undefined}
      onClick={() => save.run(() => deleteMessageAction(data.oppId, data.stage.id, templateId))}
    >
      {save.pending ? <Spinner /> : <Trash2Icon />}
    </Button>
  );
}

function MessageEditor({
  data,
  initial,
  onDone,
}: {
  data: PanelData;
  initial: { templateId: string | null; subject: string; body: string; when: "enter" | "leave" };
  onDone: () => void;
}) {
  const [v, setV] = useState(initial);
  const save = useSave();
  const final = isFinal(data.stage.category);
  return (
    <div className="space-y-3 rounded-lg border p-3">
      {!final && (
        <div className="max-w-xs">
          <span className={label}>Send</span>
          <Dropdown
            ariaLabel="When to send"
            value={v.when}
            options={[
              { value: "enter", label: "When an application enters this stage" },
              { value: "leave", label: "When an application leaves this stage" },
            ]}
            onValueChange={(x) => setV({ ...v, when: x as "enter" | "leave" })}
          />
        </div>
      )}
      <div>
        <label className={label} htmlFor={`subject-${initial.templateId ?? "new"}`}>
          Subject
        </label>
        <Input
          id={`subject-${initial.templateId ?? "new"}`}
          value={v.subject}
          maxLength={200}
          onChange={(e) => setV({ ...v, subject: e.target.value })}
        />
      </div>
      <div>
        <label className={label} htmlFor={`body-${initial.templateId ?? "new"}`}>
          Message
        </label>
        <Textarea
          id={`body-${initial.templateId ?? "new"}`}
          rows={6}
          value={v.body}
          onChange={(e) => setV({ ...v, body: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {"{name}"} is the applicant&apos;s name, {"{opportunity}"} the title and {"{decides_by}"}{" "}
          the decisions-by date.
        </p>
      </div>
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
          disabled={save.pending}
          onClick={() =>
            save.run(async () => {
              const r = await saveMessageAction(data.oppId, data.stage.id, v);
              if (!r.error) onDone();
              return r;
            })
          }
        >
          {save.pending && <Spinner data-icon="inline-start" />}
          Save message
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Tasks ---------------- */

function TasksPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const t = stage.modules.tasks!;
  const [items, setItems] = useState(t.checklist);
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <span className={label}>Task</span>
              <Input
                aria-label={`Task ${i + 1}`}
                value={it.title}
                maxLength={200}
                onChange={(e) =>
                  setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                }
              />
            </div>
            <div className="w-28">
              <span className={label}>Due (days)</span>
              <NumberField
                ariaLabel={`Task ${i + 1} due after, in days`}
                min={0}
                max={365}
                value={it.dueDays}
                onValueChange={(x) =>
                  setItems(items.map((y, j) => (j === i ? { ...y, dueDays: x } : y)))
                }
              />
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove task ${i + 1}`}
              onClick={() => setItems(items.filter((_, j) => j !== i))}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      {!data.readOnly && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setItems([...items, { title: "", assignee: "coordinator", dueDays: null }])
            }
          >
            <PlusIcon data-icon="inline-start" />
            Add task
          </Button>
          <SaveRow
            save={save}
            onSave={() =>
              save.run(() =>
                saveModuleAction(data.oppId, stage.id, "tasks", {
                  ...t,
                  checklist: items.filter((x) => x.title.trim()),
                }),
              )
            }
          />
        </>
      )}
      <Applicant>nothing. The checklist is for your team.</Applicant>
    </div>
  );
}

/* ---------------- Files ---------------- */

const PRESETS = Object.entries(FILE_ACCEPT).map(([value, p]) => ({ value, label: p.label }));
const presetOf = (accept: string[]) =>
  Object.entries(FILE_ACCEPT).find(([, p]) => p.accept.join() === accept.join())?.[0] ??
  "documents";

function FilesPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const f = stage.modules.files!;
  const [docs, setDocs] = useState(f.required);
  const [folder, setFolder] = useState(f.folder ?? "per_subject");
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {docs.map((d, i) => (
          <li key={i} className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <span className={label}>Document</span>
              <Input
                aria-label={`Document ${i + 1}`}
                value={d.label}
                maxLength={120}
                onChange={(e) =>
                  setDocs(docs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
            </div>
            <div className="w-48">
              <span className={label}>Accepted files</span>
              <Dropdown
                ariaLabel={`Document ${i + 1} accepted files`}
                value={presetOf(d.accept)}
                options={PRESETS}
                onValueChange={(x) =>
                  setDocs(
                    docs.map((y, j) =>
                      j === i
                        ? { ...y, accept: [...FILE_ACCEPT[x as keyof typeof FILE_ACCEPT].accept] }
                        : y,
                    ),
                  )
                }
              />
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove document ${i + 1}`}
              onClick={() => setDocs(docs.filter((_, j) => j !== i))}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      <div className="max-w-xs">
        <span className={label}>Shared folder</span>
        <Dropdown
          ariaLabel="Shared folder"
          value={folder}
          options={[
            { value: "per_subject", label: "One per application" },
            { value: "per_cohort", label: "One for the whole cohort" },
          ]}
          onValueChange={(x) => setFolder(x as typeof folder)}
        />
      </div>
      {!data.readOnly && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setDocs([
                ...docs,
                { label: "", accept: [...FILE_ACCEPT.documents.accept], maxMb: 10 },
              ])
            }
          >
            <PlusIcon data-icon="inline-start" />
            Add a required document
          </Button>
          <SaveRow
            save={save}
            onSave={() =>
              save.run(() =>
                saveModuleAction(data.oppId, stage.id, "files", {
                  ...f,
                  required: docs.filter((d) => d.label.trim()),
                  folder,
                }),
              )
            }
          />
        </>
      )}
      <Applicant>
        {docs.length ? docs.map((d) => `“Upload: ${d.label || "…"}”`).join(", ") : "nothing"} on
        their status page.
      </Applicant>
    </div>
  );
}

/* ---------------- Payments ---------------- */

function PaymentsPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const p = stage.modules.payments!;
  const [v, setV] = useState({ ...p, amount: p.amountCents / 100 });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <span className={label}>Kind</span>
          <Dropdown
            ariaLabel="Payment kind"
            value={v.kind}
            options={[
              { value: "fee", label: stage.isEntry ? "Application fee (at submit)" : "Fee" },
              { value: "deposit", label: "Deposit (requested on entering)" },
            ]}
            onValueChange={(x) => setV({ ...v, kind: x as "fee" | "deposit" })}
          />
        </div>
        <div>
          <span className={label}>Amount</span>
          <NumberField
            ariaLabel="Amount"
            min={0.5}
            step={0.01}
            decimals={2}
            value={v.amount}
            onValueChange={(x) => setV({ ...v, amount: x ?? 0 })}
          />
        </div>
        <div>
          <span className={label}>Currency</span>
          <Input
            aria-label="Currency"
            maxLength={3}
            value={v.currency.toUpperCase()}
            onChange={(e) => setV({ ...v, currency: e.target.value.toLowerCase() })}
          />
        </div>
      </div>
      <div>
        <span className={label}>Shown on the receipt</span>
        <Input
          aria-label="Description"
          maxLength={200}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={v.waivable} onCheckedChange={(x) => setV({ ...v, waivable: !!x })} />
        Offer a fee waiver code
      </label>
      <p className="text-xs text-muted-foreground">
        Needs Stripe connected in Settings → Payments.
      </p>
      {!data.readOnly && (
        <SaveRow
          save={save}
          onSave={() => {
            const { amount, ...rest } = v;
            save.run(() =>
              saveModuleAction(data.oppId, stage.id, "payments", {
                ...rest,
                amountCents: Math.round(amount * 100),
              }),
            );
          }}
        />
      )}
      <Applicant>a payment step and a receipt.</Applicant>
    </div>
  );
}

/* ---------------- Routing ---------------- */

type RoutingRule = NonNullable<StageModuleConfigs["routing"]>["rules"][number];

function RoutingPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const r = stage.modules.routing!;
  const [rules, setRules] = useState<RoutingRule[]>(r.rules);
  const fields = data.formFields
    .filter((f) => !["heading", "paragraph", "file"].includes(f.type))
    .map((f) => ({ value: f.id, label: f.label || f.id }));
  const kindOf = (to: RoutingRule["to"]) => ("flag" in to ? "flag" : "track");
  const set = (i: number, patch: Partial<RoutingRule>) =>
    setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rules.map((rule, i) => {
          const c = rule.conditions[0] ?? {
            fieldId: fields[0]?.value ?? "",
            op: "equals",
            value: "",
          };
          const kind = kindOf(rule.to);
          return (
            <li key={i} className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span>If</span>
                <Dropdown
                  ariaLabel="Question"
                  size="sm"
                  value={c.fieldId}
                  options={fields}
                  onValueChange={(x) => set(i, { conditions: [{ ...c, fieldId: x }] })}
                />
                <Dropdown
                  ariaLabel="Comparison"
                  size="sm"
                  value={c.op}
                  options={[
                    { value: "equals", label: "is" },
                    { value: "not_equals", label: "is not" },
                    { value: "contains", label: "contains" },
                  ]}
                  onValueChange={(x) => set(i, { conditions: [{ ...c, op: x }] })}
                />
                <Input
                  aria-label="Answer"
                  className="h-8 w-40"
                  value={String(c.value ?? "")}
                  onChange={(e) => set(i, { conditions: [{ ...c, value: e.target.value }] })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>then</span>
                <Dropdown
                  ariaLabel="Then"
                  size="sm"
                  value={kind}
                  options={[
                    { value: "track", label: "set the track" },
                    { value: "flag", label: "flag for review" },
                  ]}
                  onValueChange={(x) => set(i, { to: x === "flag" ? { flag: "" } : { tag: "" } })}
                />
                <Input
                  aria-label={kind === "flag" ? "Requirement" : "Track"}
                  className="h-8 w-56"
                  placeholder={kind === "flag" ? "Enrolled at a university" : "engineering"}
                  value={"flag" in rule.to ? rule.to.flag : "tag" in rule.to ? rule.to.tag : ""}
                  onChange={(e) =>
                    set(i, {
                      to: kind === "flag" ? { flag: e.target.value } : { tag: e.target.value },
                    })
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove routing rule ${i + 1}`}
                  onClick={() => setRules(rules.filter((_, j) => j !== i))}
                >
                  <Trash2Icon />
                </Button>
              </div>
              {kind === "flag" && (
                <p className="text-xs text-muted-foreground">
                  Flag for review: &ldquo;Doesn&apos;t meet:{" "}
                  {"flag" in rule.to && rule.to.flag ? rule.to.flag : "[requirement]"}&rdquo;. A
                  coordinator sees the flag and decides. Bookly never turns applicants down
                  automatically.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {!data.readOnly && (
        <>
          {fields.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setRules([
                  ...rules,
                  {
                    match: "all",
                    conditions: [{ fieldId: fields[0]!.value, op: "equals", value: "" }],
                    to: { tag: "" },
                  },
                ])
              }
            >
              <PlusIcon data-icon="inline-start" />
              Add routing rule
            </Button>
          )}
          <SaveRow
            save={save}
            onSave={() =>
              save.run(() =>
                saveModuleAction(data.oppId, stage.id, "routing", {
                  ...r,
                  rules: rules.map((x) => ({
                    ...x,
                    to: "tag" in x.to ? { tag: x.to.tag.trim().toLowerCase() } : x.to,
                  })),
                }),
              )
            }
          />
        </>
      )}
      <Applicant>nothing. Routing never moves or rejects an application.</Applicant>
    </div>
  );
}

/* ---------------- Decisions ---------------- */

function DecisionsPanel({ data }: { data: PanelData }) {
  const { stage } = data;
  const save = useSave();
  const d = stage.modules.decisions!;
  const [batch, setBatch] = useState(d.batch);
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          Decide together in a batch
          <span className="block text-xs text-muted-foreground">
            For a decision meeting: everyone&apos;s outcome is released at the same time.
          </span>
        </span>
        <Switch
          checked={batch}
          onCheckedChange={setBatch}
          aria-label="Decide together in a batch"
        />
      </label>
      <p className="text-sm text-muted-foreground">Coordinators decide. Rules never decide.</p>
      {!data.readOnly && (
        <SaveRow
          save={save}
          onSave={() =>
            save.run(() => saveModuleAction(data.oppId, stage.id, "decisions", { ...d, batch }))
          }
        />
      )}
      <Applicant>the message of the outcome stage, when you release decisions.</Applicant>
    </div>
  );
}

export type { RuleAction };
