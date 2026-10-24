"use client";

import { useState } from "react";
import { CircleAlertIcon, InfoIcon, MailIcon, MonitorIcon, SmartphoneIcon } from "lucide-react";
import { cn } from "cn";
import {
  fillSample,
  isFinal,
  journeySummary,
  type JourneyStage,
  type JourneyWarning,
  type Touchpoint,
} from "@/server/hiring/setup-text";

export type PreviewData = {
  title: string;
  cohortName: string | null;
  closesAt: string | null;
  decidesBy: string | null;
  timezone: string;
  fields: { id: string; label: string; type: string; required: boolean }[];
  notice: string;
  accommodations: boolean;
  journey: { stages: JourneyStage[]; warnings: JourneyWarning[]; emails: number };
};

const day = (iso: string | null, timeZone: string) =>
  iso
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(
        new Date(iso),
      )
    : null;

/**
 * S6: what an applicant sees and receives. "Applicant view" follows the selected stage (the
 * application page on the entry stage, the status page after it, with the emails of the stage);
 * "Journey" lists every touchpoint of every stage with the blocking and advisory warnings.
 */
export function ApplicantPreview({ data, stageKey }: { data: PreviewData; stageKey: string }) {
  const [view, setView] = useState<"applicant" | "journey">("applicant");
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const idx = Math.max(
    0,
    data.journey.stages.findIndex((s) => s.key === stageKey),
  );
  const stage = data.journey.stages[idx];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Preview"
          value={view}
          onChange={(v) => setView(v as typeof view)}
          options={[
            { value: "applicant", label: "Applicant view" },
            { value: "journey", label: "Journey" },
          ]}
        />
        {view === "applicant" && (
          <Segmented
            label="Device"
            value={device}
            onChange={(v) => setDevice(v as typeof device)}
            options={[
              { value: "phone", label: "Phone", icon: SmartphoneIcon },
              { value: "desktop", label: "Desktop", icon: MonitorIcon },
            ]}
          />
        )}
      </div>
      {view === "journey" ? (
        <Journey data={data} />
      ) : stage ? (
        <div className={cn("mx-auto space-y-3", device === "phone" ? "max-w-[360px]" : "w-full")}>
          <p className="text-xs text-muted-foreground">
            {idx === 0 ? "Application page" : "Status page"} at{" "}
            <span className="font-medium">{stage.name}</span>
          </p>
          {idx === 0 ? <ApplicationPage data={data} /> : <StatusPage data={data} stage={stage} />}
          {stage.touchpoints
            .filter((t): t is Extract<Touchpoint, { kind: "email" }> => t.kind === "email")
            .map((t, i) => (
              <EmailCard key={i} email={t} data={data} />
            ))}
        </div>
      ) : null}
    </div>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: typeof MailIcon }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon && <o.icon className="size-3.5" aria-hidden />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border bg-background p-4 text-sm shadow-xs">
      {children}
    </div>
  );
}

function ApplicationPage({ data }: { data: PreviewData }) {
  const closes = day(data.closesAt, data.timezone);
  const decides = day(data.decidesBy, data.timezone);
  // What an applicant sees, not the team's stages: "Under review" once, however many stages say it.
  const next = data.journey.stages
    .filter((s) => !isFinal(s.category))
    .filter((s, i, all) => i === 0 || all[i - 1]!.label !== s.label);
  return (
    <Frame>
      <div>
        <p className="text-base font-semibold">{data.title || "[Title]"}</p>
        <p className="text-xs text-muted-foreground">
          {[data.cohortName, closes ? `Applications close ${closes}` : "[Closing date]"]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium">What happens next</p>
        <ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {next.map((s) => (
            <li key={s.key}>· {s.label}</li>
          ))}
          <li>· Decisions by {decides ?? "[decisions-by date]"}</li>
        </ol>
      </div>
      <ul className="space-y-2" aria-label="Application questions">
        {data.fields.map((f) => (
          <li key={f.id}>
            <p className="text-xs font-medium">
              {f.label || "[Question]"}
              {f.required && <span className="text-destructive"> *</span>}
            </p>
            {f.type === "checkbox" || f.type === "consent" ? null : f.type === "heading" ||
              f.type === "paragraph" ? null : (
              <div
                className={cn(
                  "mt-1 rounded-md border bg-muted/40",
                  f.type === "long_text" ? "h-14" : "h-7",
                )}
              />
            )}
          </li>
        ))}
      </ul>
      {data.accommodations && (
        <p className="rounded-md bg-muted/60 p-2 text-xs">
          Need an accommodation to take part? Tell us here. Requests go to coordinators only.
        </p>
      )}
      <p className="text-xs text-muted-foreground">You must be 16 or older to apply.</p>
      {data.notice ? (
        <p className="line-clamp-3 text-xs text-muted-foreground">{data.notice}</p>
      ) : (
        <p className="text-xs text-destructive">[Add your privacy notice]</p>
      )}
      <div className="h-8 rounded-md bg-ink" aria-hidden />
    </Frame>
  );
}

function StatusPage({ data, stage }: { data: PreviewData; stage: JourneyStage }) {
  const actions = stage.touchpoints.filter(
    (t): t is Extract<Touchpoint, { kind: "action" }> => t.kind === "action",
  );
  return (
    <Frame>
      <p className="text-base font-semibold">{data.title || "[Title]"}</p>
      <p>
        Your application:{" "}
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium">
          {stage.label}
        </span>
      </p>
      {actions.length > 0 && (
        <ul className="space-y-1">
          {actions.map((a, i) => (
            <li key={i} className="rounded-md border px-2 py-1.5 text-xs font-medium">
              {a.text}
            </li>
          ))}
        </ul>
      )}
      {!isFinal(stage.category) && (
        <p className="text-xs text-muted-foreground">Withdraw my application</p>
      )}
    </Frame>
  );
}

function EmailCard({
  email,
  data,
}: {
  email: Extract<Touchpoint, { kind: "email" }>;
  data: PreviewData;
}) {
  const v = {
    title: data.title,
    decidesBy: data.decidesBy ? new Date(data.decidesBy) : null,
    timezone: data.timezone,
  };
  return (
    <div className="rounded-xl border bg-card p-3 text-xs">
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <MailIcon className="size-3.5" aria-hidden />
        {email.when === "release"
          ? "Sent when you release decisions"
          : email.when === "leave"
            ? "Email on leaving"
            : "Email on entering"}
      </p>
      <p className="mt-1 font-medium">{fillSample(email.subject, v) || "[Add a subject]"}</p>
      <p className="mt-1 whitespace-pre-line text-muted-foreground">
        {fillSample(email.body, v) || "[Add your message]"}
      </p>
    </div>
  );
}

function Journey({ data }: { data: PreviewData }) {
  const { journey } = data;
  const general = journey.warnings.filter((w) => !w.stageKey);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{journeySummary(journey)}</p>
      {general.map((w, i) => (
        <Warning key={i} w={w} />
      ))}
      <ol className="space-y-3 border-l pl-4">
        {journey.stages.map((s) => {
          const warn = journey.warnings.filter((w) => w.stageKey === s.key);
          const emails = s.touchpoints.filter((t) => t.kind === "email") as Extract<
            Touchpoint,
            { kind: "email" }
          >[];
          const actions = s.touchpoints.filter((t) => t.kind === "action") as Extract<
            Touchpoint,
            { kind: "action" }
          >[];
          return (
            <li key={s.key} className="relative text-sm">
              <span
                className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border"
                aria-hidden
              />
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {[
                  emails.length ? emails.map((e) => `email ${e.subject}`).join(" · ") : "no email",
                  `status ${s.label}`,
                  ...actions.map((a) => `action ${a.text}`),
                ].join(" · ")}
              </p>
              {isFinal(s.category) && emails.length > 0 && (
                <p className="text-xs text-muted-foreground">Sent when you release decisions</p>
              )}
              {warn.map((w, i) => (
                <Warning key={i} w={w} />
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Warning({ w }: { w: JourneyWarning }) {
  const Icon = w.tone === "blocking" ? CircleAlertIcon : InfoIcon;
  return (
    <p
      className={cn(
        "mt-1 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs",
        w.tone === "blocking"
          ? "bg-destructive/10 text-destructive"
          : "bg-warning-muted text-foreground",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="sr-only">{w.tone === "blocking" ? "Must fix: " : "Advice: "}</span>
        {w.text}
      </span>
    </p>
  );
}
