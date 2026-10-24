/**
 * "Works with your tools" (the Home concept's strip). Names in text, not logos: nominative use
 * of other companies' marks, and nothing to keep in sync with their brand files.
 */
const TOOLS = [
  "Google Calendar",
  "Outlook",
  "Google Meet",
  "Zoom",
  "Microsoft Teams",
  "Stripe",
  "HubSpot",
  "Pipedrive",
];

export function WorksWith() {
  return (
    <section aria-labelledby="works-with" className="px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-border" aria-hidden />
          <h2
            id="works-with"
            className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
          >
            Works with your tools
          </h2>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {TOOLS.map((t) => (
            <li key={t} className="text-lg font-semibold tracking-tight text-foreground/70">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
