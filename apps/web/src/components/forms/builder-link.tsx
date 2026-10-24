"use client";

import Link from "next/link";
import { ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openFormBuilder } from "@/app/(admin)/admin/forms/actions";

/**
 * Where an editor shows its questions once the form builder owns them (`forms_v2`): a short
 * list and a way into the builder. Without a form yet, the button creates it (it submits the
 * surrounding editor form to that action, so save other changes first).
 */
export function FormBuilderLink({
  owner,
  formId,
  questions,
}: {
  owner: { type: "event_type" | "routing_form"; id: string };
  formId: string | null;
  questions: { label: string; kind: string; conditional: boolean }[];
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      {questions.length ? (
        <ol className="space-y-1 text-sm">
          {questions.map((q, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{q.label || "Untitled"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {q.kind}
                {q.conditional ? " · conditional" : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No questions beyond name and email.</p>
      )}
      {formId ? (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/admin/forms/${formId}`} />}
        >
          <ListChecksIcon /> Edit questions
        </Button>
      ) : (
        <Button
          type="submit"
          variant="outline"
          size="sm"
          formNoValidate
          formAction={openFormBuilder.bind(null, owner.type, owner.id)}
        >
          <ListChecksIcon /> Edit questions
        </Button>
      )}
    </div>
  );
}
