"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Adds ?tz=<browser zone> to the URL on first visit so the server renders slots in the visitor's time. */
export function TzDetect() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  useEffect(() => {
    if (sp.get("tz")) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const next = new URLSearchParams(sp.toString());
    next.set("tz", tz);
    router.replace(`${pathname}?${next.toString()}`);
  }, [sp, pathname, router]);
  return null;
}
