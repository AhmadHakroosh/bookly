"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveContact, type ContactState } from "../actions";
import { DatePicker } from "@/components/date-picker";

type Values = {
  id: string;
  name: string;
  company: string;
  phone: string;
  tags: string;
  notes: string;
  nextFollowUpAt: string;
};

export function ContactDetailsForm({ contact }: { contact: Values }) {
  const [state, action, pending] = useActionState(saveContact, {} as ContactState);
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action} className="rounded-xl border p-4">
      <input type="hidden" name="id" value={contact.id} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" name="name" defaultValue={contact.name} />
        </Field>
        <Field>
          <FieldLabel htmlFor="company">Company</FieldLabel>
          <Input id="company" name="company" defaultValue={contact.company} />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">Phone</FieldLabel>
          <Input id="phone" name="phone" defaultValue={contact.phone} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tags">Tags</FieldLabel>
          <Input id="tags" name="tags" defaultValue={contact.tags} placeholder="vip, partner" />
          <FieldDescription>Comma-separated.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="nextFollowUpAt">Follow up on</FieldLabel>
          <DatePicker
            id="nextFollowUpAt"
            name="nextFollowUpAt"
            defaultValue={contact.nextFollowUpAt}
            placeholder="No date"
          />
          <FieldDescription>Shows up in your inbox when the day comes.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea id="notes" name="notes" rows={5} defaultValue={contact.notes} />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </FieldGroup>
    </form>
  );
}
