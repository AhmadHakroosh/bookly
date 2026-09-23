"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "@/components/dropdown";

export function TzPicker({ value, zones }: { value: string; zones: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const list = zones.includes(value) ? zones : [value, ...zones];
  return (
    <Dropdown
      ariaLabel="Timezone"
      value={value}
      size="sm"
      className="max-w-full"
      contentClassName="max-h-80"
      options={list.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
      onValueChange={(tz) => {
        const next = new URLSearchParams(sp.toString());
        next.set("tz", tz);
        next.delete("slot");
        router.replace(`${pathname}?${next.toString()}`);
      }}
    />
  );
}
