"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDomain, type DomainState } from "./actions";

export function AddDomainForm() {
  const [state, action, pending] = useActionState(addDomain, {} as DomainState);
  return (
    <form action={action} className="flex max-w-xl items-start gap-2">
      <div className="flex-1">
        <Input name="host" placeholder="book.example.com" required aria-invalid={!!state.error} />
        {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
      </div>
      <Button type="submit" disabled={pending}>
        Add domain
      </Button>
    </form>
  );
}
