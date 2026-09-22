import type { Workspace } from "@bookly/db/schema";
import { workspaceBrand } from "@/server/brand";
import { baseUrl } from "@/server/scheduling";
import type { EmailBrand } from "./layout";

/** The workspace's look for outgoing mail; the platform's when no workspace is involved. */
export function brandFor(ws: Workspace | null): EmailBrand {
  const base = baseUrl();
  // The same rule as the booking pages: your logo and colour in, the Bookly footer out.
  const b = workspaceBrand(ws);
  return {
    name: b.name,
    logoUrl: b.logoUrl ?? `${base}/logo-mark.png`,
    accent: b.accent,
    baseUrl: base,
    poweredBy: b.poweredBy,
  };
}

/**
 * Same brand, but with the logo inlined as a data URI. Only for in-app previews: the page's CSP
 * allows `data:` images, whereas an absolute URL breaks when the admin is browsed on a host
 * other than APP_URL (local development) or the logo host is unreachable. Sent emails keep the
 * absolute URL, which mail clients handle better than data URIs.
 */
export async function brandForPreview(ws: Workspace | null): Promise<EmailBrand> {
  const brand = brandFor(ws);
  const inline = await inlineImage(brand.logoUrl, brand.baseUrl);
  return inline ? { ...brand, logoUrl: inline } : brand;
}

async function inlineImage(url: string, base: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    // The default mark lives in this app's public folder: read it without a network round-trip.
    if (url === `${base}/logo-mark.png`) {
      const { readFile } = await import("node:fs/promises");
      const path = await import("node:path");
      const buf = await readFile(path.join(process.cwd(), "public", "logo-mark.png"));
      return `data:image/png;base64,${buf.toString("base64")}`;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 512 * 1024) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
