"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { EventLocation, LocationType } from "@bookly/db/schema";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/dropdown";

export const LOCATION_OPTIONS: [LocationType, string][] = [
  ["daily", "Bookly video"],
  ["google_meet", "Google Meet"],
  ["zoom", "Zoom"],
  ["teams", "Microsoft Teams"],
  ["phone", "Phone call"],
  ["in_person", "In person"],
  ["custom", "Custom text / link"],
];

export type ConferencingReady = {
  daily: boolean;
  google_meet: boolean;
  teams: boolean;
  zoom: boolean;
  /** false when the plan has no Bookly video: the option is shown but cannot be picked. */
  videoPlan?: boolean;
};

const needsValue = (t: LocationType) => t === "phone" || t === "in_person" || t === "custom";
const valueLabel = (t: LocationType) =>
  t === "phone" ? "Note for attendees" : t === "in_person" ? "Address" : "Text or link";
const placeholder = (t: LocationType) =>
  t === "phone" ? "Note, e.g. We call you" : t === "in_person" ? "Address" : "Text or link";

/**
 * One or more ways to meet. The first row is the default; with more than one, the attendee
 * picks on the booking form. Submitted as JSON in `locationsJson`.
 */
export function LocationsEditor({
  initial,
  ready,
  onChange,
}: {
  initial: EventLocation[];
  ready: ConferencingReady;
  onChange?: (locs: EventLocation[]) => void;
}) {
  const [rows, setRows] = useState<EventLocation[]>(initial.length ? initial : [{ type: "daily" }]);
  const update = (next: EventLocation[]) => {
    setRows(next);
    onChange?.(next);
  };
  const used = new Set(rows.map((r) => r.type));
  const free = LOCATION_OPTIONS.filter(([t]) => !used.has(t));
  return (
    <div className="space-y-2">
      <input type="hidden" name="locationsJson" value={JSON.stringify(rows)} />
      {rows.map((r, i) => {
        const conf = r.type in ready ? ready[r.type as keyof ConferencingReady] : null;
        const hints = [
          i === 0 && rows.length > 1 ? "Default" : null,
          r.type === "daily" && ready.videoPlan === false
            ? "Bookly video needs the Pro plan: until then bookings show a video-link note instead"
            : conf === false
              ? "Not connected: bookings fall back to Bookly video or the email"
              : null,
          r.type === "in_person" ? "Leave the address blank to ask the attendee for theirs" : null,
          r.type === "phone" ? "Attendees enter their number; the note shows beside it" : null,
        ].filter(Boolean);
        return (
          <div key={r.type} className="space-y-1">
            <div className="flex items-center gap-2">
              <Dropdown
                ariaLabel={`Location ${i + 1}`}
                value={r.type}
                className={needsValue(r.type) ? "w-40 shrink-0" : "min-w-0 flex-1"}
                options={LOCATION_OPTIONS.filter(([t]) => t === r.type || !used.has(t)).map(
                  ([t, l]) => {
                    const c =
                      t in ready
                        ? (ready[t as keyof ConferencingReady] as boolean | undefined)
                        : null;
                    if (t === "daily" && ready.videoPlan === false)
                      return { value: t, label: `${l} (Pro)`, disabled: r.type !== t };
                    return {
                      value: t,
                      label: `${l}${c === false ? (t === "daily" ? " — not set up" : " — not connected") : ""}`,
                    };
                  },
                )}
                onValueChange={(v) => {
                  const type = v as LocationType;
                  update(rows.map((x, j) => (j === i ? { type, value: undefined } : x)));
                }}
              />
              {needsValue(r.type) && (
                <Input
                  aria-label={valueLabel(r.type)}
                  placeholder={placeholder(r.type)}
                  value={r.value ?? ""}
                  onChange={(e) =>
                    update(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                  className="h-8 min-w-0 flex-1"
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove location ${i + 1}`}
                disabled={rows.length === 1}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => update(rows.filter((_, j) => j !== i))}
              >
                <Trash2Icon />
              </Button>
            </div>
            {hints.length > 0 && (
              <p className="text-xs text-muted-foreground">{hints.join(" · ")}</p>
            )}
          </div>
        );
      })}
      {free.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => update([...rows, { type: free[0]![0] }])}
        >
          <PlusIcon /> Add another way to meet
        </Button>
      )}
      <FieldDescription>
        {rows.length > 1
          ? "Attendees choose one of these when they book. The first is the default and the one used by the API when no choice is made."
          : "Add more options and attendees choose one when they book. Meeting links are created automatically for video providers; a phone call asks the attendee for their number, an in-person meeting without an address asks for theirs."}
      </FieldDescription>
    </div>
  );
}
