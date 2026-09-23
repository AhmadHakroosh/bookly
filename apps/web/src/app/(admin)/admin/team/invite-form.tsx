"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteMember, type TeamState } from "./actions";
import { Dropdown } from "@/components/dropdown";

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
      <Dropdown
        name="role"
        defaultValue="member"
        ariaLabel="Role"
        className="w-64"
        options={[
          { value: "member", label: "Member (own booking page)" },
          { value: "admin", label: "Admin (manages everything)" },
        ]}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Invite"}
      </Button>
    </form>
  );
}
