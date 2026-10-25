"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Dropdown } from "@/components/dropdown";
import { saveDefaultConferencing } from "../integrations-actions";

/** "Default conferencing tool": what new event types start with. Saves as it is picked. */
export function DefaultConferencing({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <Dropdown
      id="default-conferencing"
      ariaLabel="Default conferencing tool"
      defaultValue={value}
      disabled={pending || options.length < 2}
      options={options}
      className="w-full sm:w-56"
      onValueChange={(v) =>
        start(async () => {
          const r = await saveDefaultConferencing(v);
          if (r.error) toast.error(r.error);
          else toast.success("Default conferencing tool saved");
        })
      }
    />
  );
}
