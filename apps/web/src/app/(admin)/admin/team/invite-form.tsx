"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteMember, type TeamState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, {} as TeamState);
  useEffect(() => {
    if (state.ok) toast.success("Invitation sent");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-xl border p-4">
      <Input
        name="email"
        type="email"
        placeholder="teammate@example.com"
        required
        className="flex-1"
      />
      <select
        name="role"
        defaultValue="member"
        className="h-8 rounded-lg border bg-background px-2 text-sm"
      >
        <option value="member">Member (own booking page)</option>
        <option value="admin">Admin (manages everything)</option>
      </select>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Invite"}
      </Button>
    </form>
  );
}
