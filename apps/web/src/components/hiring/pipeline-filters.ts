/** The list view's filters; Needs attention links to them (`?view=list&filter=`). */
export const FILTERS = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "feedback", label: "Feedback missing" },
  { id: "scheduling", label: "Awaiting scheduling" },
  { id: "waiting", label: "Waiting long" },
] as const;
export type Filter = (typeof FILTERS)[number]["id"];
