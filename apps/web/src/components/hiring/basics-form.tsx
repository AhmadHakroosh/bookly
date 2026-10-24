"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { Dropdown } from "@/components/dropdown";
import { NumberField } from "@/components/number-field";
import { SubmitButton } from "@/components/submit-button";
import { TimePicker } from "@/components/time-picker";
import { TimezoneField } from "@/components/timezone-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  saveBasicsAction,
  type BasicsState,
} from "@/app/(admin)/admin/hiring/opportunities/actions";
import { slugify } from "@/server/hiring/setup-text";

export type BasicsValues = {
  title: string;
  cohortName: string;
  type: string;
  opensDate: string;
  opensTime: string;
  closesDate: string;
  closesTime: string;
  decidesDate: string;
  capacity: number | null;
  timezone: string;
  slug: string;
};

const LABELS: Record<string, string> = {
  title: "Title",
  cohortName: "Cohort",
  slug: "Application link",
  opensAt: "Applications open",
  closesAt: "Applications close",
  decidesBy: "Decisions by",
  capacity: "Seats",
  timezone: "Timezone",
  form: "Basics",
};

/**
 * S2 Basics: title, cohort, type, the application window, the decisions-by date applicants see,
 * seats and the public link. Errors sit under their field and in a summary that takes focus.
 */
export function BasicsForm({
  id,
  initial,
  types,
  zones,
  linkBase,
  untitled,
}: {
  id: string;
  initial: BasicsValues;
  types: { value: string; label: string }[];
  zones: string[];
  /** "https://acme.bookly.app/apply/" */
  linkBase: string;
  /** The draft still has its placeholder title: the slug follows the title as it is typed. */
  untitled: boolean;
}) {
  const [state, action] = useActionState<BasicsState, FormData>(
    saveBasicsAction.bind(null, id),
    {},
  );
  const [title, setTitle] = useState(initial.title === "Untitled opportunity" ? "" : initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(!untitled);
  const [opensNow, setOpensNow] = useState(!initial.opensDate);
  const [noLimit, setNoLimit] = useState(initial.capacity === null);
  const summary = useRef<HTMLDivElement>(null);
  const problems = state.problems ?? {};
  const err = (k: string) => problems[k];
  useEffect(() => {
    if (state.problems && Object.keys(state.problems).length) summary.current?.focus();
  }, [state]);
  const tzLabel = initial.timezone;
  return (
    <form action={action} className="space-y-6" noValidate>
      {Object.keys(problems).length > 0 && (
        <div
          ref={summary}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm outline-none"
        >
          <p className="font-medium text-destructive">
            {Object.keys(problems).length === 1
              ? "1 thing to fix"
              : `${Object.keys(problems).length} things to fix`}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {Object.entries(problems).map(([k, v]) => (
              <li key={k}>
                <a href={`#basics-${k}`} className="underline underline-offset-2">
                  {LABELS[k] ?? k}
                </a>
                : {v}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field id="title" label="Title" error={err("title")} className="md:col-span-2">
          <Input
            id="basics-title"
            name="title"
            required
            maxLength={120}
            value={title}
            placeholder="2027 Horizon Fellowship"
            aria-invalid={!!err("title")}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </Field>
        <Field id="cohortName" label="Cohort (optional)" error={err("cohortName")}>
          <Input
            id="basics-cohortName"
            name="cohortName"
            maxLength={80}
            defaultValue={initial.cohortName}
            placeholder="Spring cohort"
          />
        </Field>
        <Field id="type" label="Type">
          <Dropdown id="basics-type" name="type" defaultValue={initial.type} options={types} />
        </Field>
        <Field id="opensAt" label="Applications open" error={err("opensAt")}>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="opensNow"
              checked={opensNow}
              onCheckedChange={(v) => setOpensNow(!!v)}
            />
            As soon as I publish
          </label>
          {!opensNow && (
            <div className="mt-2 flex gap-2">
              <DatePicker
                id="basics-opensAt"
                name="opensDate"
                defaultValue={initial.opensDate}
                ariaLabel="Opening date"
              />
              <TimePicker
                name="opensTime"
                defaultValue={initial.opensTime || "09:00"}
                ariaLabel="Opening time"
              />
            </div>
          )}
        </Field>
        <Field
          id="closesAt"
          label="Applications close"
          error={err("closesAt")}
          help={`Shown in ${tzLabel}.`}
        >
          <div className="flex gap-2">
            <DatePicker
              id="basics-closesAt"
              name="closesDate"
              defaultValue={initial.closesDate}
              ariaLabel="Closing date"
            />
            <TimePicker
              name="closesTime"
              defaultValue={initial.closesTime || "23:59"}
              ariaLabel="Closing time"
            />
          </div>
        </Field>
        <Field
          id="decidesBy"
          label="Decisions by"
          error={err("decidesBy")}
          help="Applicants see this date. Choose one you can keep."
        >
          <DatePicker
            id="basics-decidesBy"
            name="decidesDate"
            defaultValue={initial.decidesDate}
            ariaLabel="Decisions by"
          />
        </Field>
        <Field
          id="capacity"
          label="Seats"
          error={err("capacity")}
          help="We'll show how many seats are filled while you decide. Applicants don't see this number."
        >
          <div className="flex flex-wrap items-center gap-3">
            {!noLimit && (
              <NumberField
                id="basics-capacity"
                name="capacity"
                min={1}
                max={100000}
                defaultValue={initial.capacity ?? 20}
                ariaLabel="Seats"
                className="w-32"
              />
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="noLimit" checked={noLimit} onCheckedChange={(v) => setNoLimit(!!v)} />
              No limit
            </label>
          </div>
        </Field>
        <Field id="timezone" label="Timezone" error={err("timezone")}>
          <TimezoneField name="timezone" defaultValue={initial.timezone} zones={zones} />
        </Field>
        <Field id="slug" label="Application link" error={err("slug")} className="md:col-span-2">
          <div className="flex items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/50">
            <span className="min-w-0 shrink truncate pl-3 text-sm text-muted-foreground">
              {linkBase}
            </span>
            <input
              id="basics-slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugTouched(true);
              }}
              aria-invalid={!!err("slug")}
              aria-label="Application link"
              className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none"
            />
          </div>
        </Field>
      </div>
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-2 bg-background/95 px-1 py-3 backdrop-blur md:static md:bg-transparent md:p-0">
        {state.savedAt && !Object.keys(problems).length && (
          <span role="status" className="mr-auto text-sm text-muted-foreground">
            Saved.
          </span>
        )}
        <SubmitButton variant="outline" name="intent" value="save">
          Save
        </SubmitButton>
        <SubmitButton variant="ink" name="intent" value="next">
          Save and continue
        </SubmitButton>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  help,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={`basics-${id}`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {help && !error && <p className="mt-1.5 text-xs text-muted-foreground">{help}</p>}
      {error && (
        <p id={`basics-${id}-error`} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
