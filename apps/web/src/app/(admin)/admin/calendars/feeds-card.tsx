"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/time";
import {
  addFeedAction,
  refreshFeedAction,
  removeFeedAction,
  type FeedState,
} from "./feeds-actions";

export type FeedRow = {
  id: string;
  label: string;
  eventCount: number;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
};

/**
 * Read-only calendar subscriptions by address. Any calendar that can publish an ICS link works
 * without OAuth: Google's "secret address in iCal format", a published Outlook calendar, a
 * shared iCloud or Fastmail calendar. Busy time only; nothing is written back.
 */
export function FeedsCard({
  feeds,
  timezone,
  max,
}: {
  feeds: FeedRow[];
  timezone: string;
  max: number;
}) {
  const [state, action] = useActionState(addFeedAction, {} as FeedState);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      toast.success("Feed added");
      form.current?.reset();
    } else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Calendar feeds</h2>
        <p className="text-sm text-muted-foreground">
          Subscribe to any calendar by its private ICS address to hide the times it marks busy.
          Works with Google (&ldquo;Secret address in iCal format&rdquo;), Outlook (&ldquo;Publish
          calendar&rdquo;), iCloud and Fastmail. Read-only: bookings are not added to it, and the
          feed is refreshed every 15 minutes.
        </p>
      </div>
      {feeds.length > 0 && (
        <ul className="divide-y text-sm">
          {feeds.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">
                  {f.status === "error"
                    ? `Last fetch failed: ${f.lastError ?? "unknown error"}`
                    : `${f.eventCount} events · updated ${f.lastSyncedAt ? fmtDateTime(new Date(f.lastSyncedAt), timezone) : "never"}`}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={refreshFeedAction.bind(null, f.id)}>
                  <SubmitButton variant="outline" size="sm">
                    Refresh
                  </SubmitButton>
                </form>
                <form action={removeFeedAction.bind(null, f.id)}>
                  <SubmitButton variant="ghost" size="sm">
                    Remove
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {feeds.length < max ? (
        <form ref={form} action={action} className="flex flex-wrap items-end gap-2 text-sm">
          <div className="min-w-0 flex-1 basis-72">
            <label htmlFor="feed-url" className="mb-1 block font-medium">
              Feed address
            </label>
            <Input
              id="feed-url"
              name="url"
              type="url"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              required
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="w-full sm:w-44">
            <label htmlFor="feed-label" className="mb-1 block font-medium">
              Name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input id="feed-label" name="label" placeholder="Work calendar" maxLength={80} />
          </div>
          <SubmitButton pendingText="Checking…">Add feed</SubmitButton>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Up to {max} feeds per person.</p>
      )}
    </section>
  );
}
