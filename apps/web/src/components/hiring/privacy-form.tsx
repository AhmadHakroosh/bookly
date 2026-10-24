"use client";

import { useActionState, useState } from "react";
import { LockIcon } from "lucide-react";
import {
  savePrivacyAction,
  type PrivacyState,
} from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** Retention choices (canon X4): 30 days to 24 months. */
const RETENTION = [
  { value: "30", label: "30 days" },
  { value: "91", label: "3 months" },
  { value: "183", label: "6 months" },
  { value: "365", label: "12 months" },
  { value: "548", label: "18 months" },
  { value: "730", label: "24 months" },
];

/**
 * S8, Privacy and applicant experience: the notice applicants read (pre-filled from the hiring
 * legal pack, stating the 16+ rule), how long applications of people not admitted are kept, the
 * accommodations request, and who candidate emails come from.
 */
export function PrivacyForm({
  oppId,
  initial,
  template,
  employment,
  readOnly,
}: {
  oppId: string;
  initial: {
    notice: string;
    retentionDays: number;
    accommodations: boolean;
    senderName: string;
    replyTo: string;
  };
  /** The legal pack's notice, for "Reset to template". */
  template: string;
  /** Internships and jobs: under 12 months shows a warning. */
  employment: boolean;
  readOnly: boolean;
}) {
  const [state, action] = useActionState<PrivacyState, FormData>(
    savePrivacyAction.bind(null, oppId),
    {},
  );
  const [notice, setNotice] = useState(initial.notice);
  const [retention, setRetention] = useState(String(initial.retentionDays));
  const [accommodations, setAccommodations] = useState(initial.accommodations);
  const options = RETENTION.some((r) => r.value === retention)
    ? RETENTION
    : [...RETENTION, { value: retention, label: `${retention} days` }].sort(
        (a, b) => +a.value - +b.value,
      );
  return (
    <form action={action} className="space-y-6">
      <fieldset disabled={readOnly} className="space-y-6">
        <section className="space-y-2 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="notice" className="text-sm font-semibold">
              Privacy notice
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNotice(template)}>
              Reset to template
            </Button>
          </div>
          <Textarea
            id="notice"
            name="notice"
            rows={10}
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Shown on the application page before applicants send anything. The template states that
            applicants must be 16 or older.
          </p>
        </section>

        <section className="grid gap-5 rounded-xl border bg-card p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium" id="retention-label">
              Delete applications of people not admitted
            </span>
            <div className="max-w-xs">
              <Dropdown
                name="retentionDays"
                ariaLabel="Delete applications of people not admitted after"
                value={retention}
                options={options.map((o) => ({
                  ...o,
                  label: `${o.label} after the last decision`,
                }))}
                onValueChange={setRetention}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Counted from the cycle&apos;s last decision. Admitted people stay as contacts in your
              workspace.
            </p>
            {employment && Number(retention) < 365 && (
              <p role="alert" className="mt-2 rounded-md bg-warning-muted px-3 py-2 text-xs">
                US employers must keep applications for at least a year. Check your local rules
                before choosing a shorter period.
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <LockIcon className="size-3.5" aria-hidden /> Retention policies by region
              </span>
              <span className="rounded-full border px-2 py-0.5 text-xs">Enterprise</span>
            </div>
          </div>
          <label className="flex items-start justify-between gap-3 text-sm md:col-span-2">
            <span>
              <span className="font-medium">Ask about accommodations</span>
              <span className="block text-xs text-muted-foreground">
                Requests go to coordinators only.
              </span>
            </span>
            <Switch
              name="accommodations"
              checked={accommodations}
              onCheckedChange={setAccommodations}
              aria-label="Ask about accommodations"
            />
          </label>
          <p className="text-xs text-muted-foreground md:col-span-2">
            Applicants can always withdraw from the link in their emails.
          </p>
          <div>
            <label htmlFor="senderName" className="mb-1 block text-sm font-medium">
              Sender name
            </label>
            <Input
              id="senderName"
              name="senderName"
              maxLength={80}
              defaultValue={initial.senderName}
              placeholder="Horizon Fellowship team"
            />
          </div>
          <div>
            <label htmlFor="replyTo" className="mb-1 block text-sm font-medium">
              Reply-to address
            </label>
            <Input
              id="replyTo"
              name="replyTo"
              type="email"
              defaultValue={initial.replyTo}
              placeholder="fellowship@example.org"
            />
          </div>
        </section>
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span role="status" className="mr-auto text-sm">
            {state.error ? (
              <span className="text-destructive">{state.error}</span>
            ) : state.savedAt ? (
              <span className="text-muted-foreground">Saved.</span>
            ) : null}
          </span>
          <SubmitButton variant="outline" name="intent" value="save">
            Save
          </SubmitButton>
          <SubmitButton variant="ink" name="intent" value="next">
            Save and continue
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
