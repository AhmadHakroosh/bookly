"use client";

import { useActionState } from "react";
import type { EventQuestion } from "@bookly/db/schema";
import { submitRouting, type RoutingState } from "./actions";

export function RoutingFormView({ slug, questions }: { slug: string; questions: EventQuestion[] }) {
  const [state, action, pending] = useActionState(submitRouting, {} as RoutingState);
  const field =
    "bg-background h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input name="name" required autoComplete="name" className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
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
            />
          ) : q.type === "select" ? (
            <select name={`q_${q.id}`} required={q.required} className={field} defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {(q.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={`q_${q.id}`}
              type={q.type === "email" ? "email" : q.type === "phone" ? "tel" : "text"}
              required={q.required}
              className={field}
            />
          )}
        </label>
      ))}
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "One moment…" : "Continue"}
      </button>
    </form>
  );
}
