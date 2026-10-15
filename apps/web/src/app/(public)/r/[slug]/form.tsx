"use client";

import { useActionState } from "react";
import type { EventQuestion } from "@bookly/db/schema";
import { submitRouting, type RoutingState } from "./actions";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";

export function RoutingFormView({ slug, questions }: { slug: string; questions: EventQuestion[] }) {
  const [state, action] = useActionState(submitRouting, {} as RoutingState);
  const field =
    "bg-background h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
  return (
    <form
      action={action}
      className="space-y-4"
      toolname="submit_routing_form"
      tooldescription="Answer this routing form on the guest's behalf; the answers decide which booking page or event type the guest is sent to."
    >
      <input type="hidden" name="slug" value={slug} />
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
        toolparamdescription="Leave empty. This field catches bots; any value rejects the answers."
      />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input
          name="name"
          required
          autoComplete="name"
          className={field}
          toolparamdescription="The guest's full name."
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={field}
          toolparamdescription="The guest's email address."
        />
      </label>
      {questions.map((q) => (
        <label key={q.id} className="block text-sm">
          <span className="mb-1 block font-medium">
            {q.label}
            {q.required ? (
              ""
            ) : (
              <span className="font-normal text-muted-foreground"> (optional)</span>
            )}
          </span>
          {q.type === "textarea" ? (
            <textarea
              name={`q_${q.id}`}
              required={q.required}
              rows={3}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              toolparamdescription={`The question: ${q.label}`}
            />
          ) : q.type === "select" ? (
            <Dropdown
              name={`q_${q.id}`}
              required={q.required}
              className="h-10"
              ariaLabel={q.label}
              options={(q.options ?? []).map((o) => ({ value: o, label: o }))}
              toolparamdescription={`The question: ${q.label}. One of: ${(q.options ?? []).join(", ")}.`}
            />
          ) : (
            <input
              name={`q_${q.id}`}
              type={q.type === "email" ? "email" : q.type === "phone" ? "tel" : "text"}
              required={q.required}
              className={field}
              toolparamdescription={`The question: ${q.label}`}
            />
          )}
        </label>
      ))}
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton className="h-10 w-full" pendingText="One moment…">
        Continue
      </SubmitButton>
    </form>
  );
}
