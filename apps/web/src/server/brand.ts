import type { Workspace } from "@bookly/db/schema";
import { hasFeature } from "@/server/limits";

/** Bookly's own accent: the buckle's prong. */
export const BOOKLY_ACCENT = "#e8965a";

/**
 * How a workspace presents itself to guests, on booking pages and in email. One plan feature
 * decides all of it: on plans that remove Bookly branding (Pro, Team, every self-hosted install)
 * the workspace's logo and colour replace the Bookly mark and accent, and the "Powered by
 * Bookly" line goes away. On Free the stored values are ignored until the plan changes.
 */
export type WorkspaceBrand = {
  name: string;
  /** The workspace's own logo, only on plans that include branding. */
  logoUrl: string | null;
  /** The workspace's colour on those plans, otherwise Bookly's. */
  accent: string;
  /** Set only when the workspace chose a colour and its plan honours it. */
  ownAccent: string | null;
  /** Whether the workspace's look replaces Bookly's. */
  own: boolean;
  /** Show the "Powered by Bookly" line. */
  poweredBy: boolean;
};

export function workspaceBrand(ws: Workspace | null): WorkspaceBrand {
  const own = !!ws && hasFeature(ws, "removeBranding");
  const b = own ? ws.settings.branding : undefined;
  return {
    name: ws?.name ?? "Bookly",
    logoUrl: b?.logoUrl || null,
    accent: b?.accent || BOOKLY_ACCENT,
    ownAccent: b?.accent || null,
    own,
    poweredBy: !own,
  };
}

/** Black or white, whichever reads on the given colour (WCAG relative luminance). */
export function readableOn(hex: string): "#111111" | "#ffffff" {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.4 ? "#111111" : "#ffffff";
}

/**
 * Inline CSS variables that recolour buttons, selected days and focus rings on a page. Only a
 * colour the workspace chose does this; without one the theme's own primary stays.
 */
export function accentVars(brand: WorkspaceBrand): Record<string, string> | undefined {
  if (!brand.ownAccent) return undefined;
  return {
    "--primary": brand.ownAccent,
    "--primary-foreground": readableOn(brand.ownAccent),
    "--ring": brand.ownAccent,
  };
}
