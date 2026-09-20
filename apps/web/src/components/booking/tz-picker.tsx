"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function TzPicker({ value, zones }: { value: string; zones: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label="Timezone"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        next.set("tz", e.target.value);
        next.delete("slot");
        router.replace(`${pathname}?${next.toString()}`);
      }}
      className="max-w-full rounded-md border bg-background px-2 py-1 text-xs"
    >
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
