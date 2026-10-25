/** Which links open a side pane (see components/pane.tsx); pure, so it is unit-tested. */

/** Every search parameter that opens a pane, and the ones that page inside one. */
export const PANE_PARAMS = ["task", "thread", "file", "booking", "entry", "application"] as const;
export const INSIDE_PANE = ["before"];

/**
 * Whether a click on `href` only opens or switches a pane on this page (same path, the same
 * other parameters), so it can skip the full navigation.
 */
export function paneTarget(href: string, current: URL): boolean {
  let to: URL;
  try {
    to = new URL(href, current);
  } catch {
    return false;
  }
  if (to.origin !== current.origin || to.pathname !== current.pathname) return false;
  const param = PANE_PARAMS.find((p) => to.searchParams.get(p));
  if (!param || to.searchParams.get(param) === current.searchParams.get(param)) return false;
  const rest = (u: URL) => {
    const p = new URLSearchParams(u.search);
    for (const k of [param, ...INSIDE_PANE]) p.delete(k);
    p.sort();
    return p.toString();
  };
  return rest(to) === rest(current);
}
