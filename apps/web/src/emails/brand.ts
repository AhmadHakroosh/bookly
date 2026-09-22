import type { Workspace } from "@bookly/db/schema";
import { hasFeature } from "@/server/limits";
import { baseUrl } from "@/server/scheduling";
import { BOOKLY_ACCENT, type EmailBrand } from "./layout";

/** The workspace's look for outgoing mail; the platform's when no workspace is involved. */
export function brandFor(ws: Workspace | null): EmailBrand {
  const base = baseUrl();
  const b = ws?.settings.branding;
  return {
    name: ws?.name ?? "Bookly",
    logoUrl: b?.logoUrl || `${base}/logo-mark.png`,
    accent: b?.accent || BOOKLY_ACCENT,
    baseUrl: base,
    poweredBy: ws ? !hasFeature(ws, "removeBranding") : true,
  };
}
