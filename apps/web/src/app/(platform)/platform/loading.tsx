/**
 * Segment boundary for Cache Components. Every dynamic platform page carries its own Suspense
 * fallback shaped like the page (a narrow form, the workspace list), and the console has its own
 * loading file, so nothing is drawn here: a page-wide skeleton at this level would stretch across
 * the whole layout in front of those narrower pages.
 */
export default function Loading() {
  return null;
}
