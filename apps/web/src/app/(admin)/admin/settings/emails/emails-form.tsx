"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_EMAIL_TEMPLATES as DEFAULTS } from "@/emails/defaults";
import { updateWorkspaceSettings, type SettingsState } from "../actions";

type Values = {
  confirmationSubject: string;
  confirmationBody: string;
  reminderSubject: string;
  reminderBody: string;
  cancellationSubject: string;
  cancellationBody: string;
  proposalSubject: string;
  proposalBody: string;
  paymentSubject: string;
  paymentBody: string;
  checkInSubject: string;
  checkInBody: string;
};

export function EmailsForm({ templates }: { templates: Values }) {
  const [state, action] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  useEffect(() => {
    if (state.ok) toast.success("Emails saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="section" value="emails" />
      <FieldGroup>
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-base font-semibold tracking-tight">Guest emails</legend>
          <FieldDescription>
            Your words at the top of the confirmation, reminder and cancellation emails; the booking
            details, buttons and your branding are added automatically. Leave a field blank to keep
            the default. Placeholders: {"{name} {host} {event} {when} {where} "}
            {"{duration} {bookingUrl} {workspace}"}; reminders also {"{relative}"}.
          </FieldDescription>
          {(
            [
              ["confirmation", "Confirmation", DEFAULTS.confirmation],
              ["reminder", "Reminder", DEFAULTS.reminder],
              ["cancellation", "Cancellation", DEFAULTS.cancellation],
            ] as const
          ).map(([kind, label, d]) => (
            <div key={kind} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{label}</p>
                <a
                  href={`/admin/settings/email-preview?kind=${kind}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-4"
                >
                  Preview
                </a>
              </div>
              <Input
                name={`${kind}Subject`}
                defaultValue={templates[`${kind}Subject`]}
                placeholder={d.subject}
                aria-label={`${label} subject`}
              />
              <Textarea
                name={`${kind}Body`}
                rows={3}
                defaultValue={templates[`${kind}Body`]}
                placeholder={d.body}
                aria-label={`${label} body`}
              />
            </div>
          ))}
        </fieldset>
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-base font-semibold tracking-tight">
            Proposal, payment and follow-up emails
          </legend>
          <FieldDescription>
            Used by the Proposal, Payment request and Follow-up buttons on contact pages.
            Placeholders: {"{name} {company} {host} {amount} {payLink} {bookingUrl}"}. Leave blank
            for the defaults. The postal address printed under these is set under General.
          </FieldDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="proposalSubject">Proposal subject</FieldLabel>
              <Input
                id="proposalSubject"
                name="proposalSubject"
                defaultValue={templates.proposalSubject}
              />
              <Textarea
                name="proposalBody"
                rows={6}
                defaultValue={templates.proposalBody}
                aria-label="Proposal body"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="paymentSubject">Payment request subject</FieldLabel>
              <Input
                id="paymentSubject"
                name="paymentSubject"
                defaultValue={templates.paymentSubject}
              />
              <Textarea
                name="paymentBody"
                rows={6}
                defaultValue={templates.paymentBody}
                aria-label="Payment request body"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="checkInSubject">Follow-up subject</FieldLabel>
              <Input
                id="checkInSubject"
                name="checkInSubject"
                defaultValue={templates.checkInSubject}
              />
              <Textarea
                name="checkInBody"
                rows={6}
                defaultValue={templates.checkInBody}
                aria-label="Follow-up body"
              />
            </Field>
          </div>
        </fieldset>
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </FieldGroup>
    </form>
  );
}
