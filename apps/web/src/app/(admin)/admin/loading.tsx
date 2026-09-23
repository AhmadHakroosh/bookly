/**
 * Segment boundary for Cache Components. Every admin page carries its own Suspense fallback,
 * sized to the page's container (settings and profile are narrow, lists are full width), so
 * nothing is drawn here: a skeleton at this level would stretch across the layout in front of
 * the narrower pages, and would double the layout's own padding.
 */
export default function Loading() {
  return null;
}
