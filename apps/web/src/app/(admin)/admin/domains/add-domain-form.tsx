"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { addDomain, type DomainState } from "./actions";

export function AddDomainForm() {
  const [state, action] = useActionState(addDomain, {} as DomainState);
  return (
    <form action={action} className="flex max-w-xl items-start gap-2">
      <div className="flex-1">
        <Input name="host" placeholder="book.example.com" required aria-invalid={!!state.error} />
        {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
      </div>
      <SubmitButton>Add domain</SubmitButton>
    </form>
  );
}
