"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteEventType, saveEventType } from "../../scheduling-actions";

type Values = {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMin: number;
  slotIntervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
  maxPerDay: number;
  locationType: string;
  locationValue: string;
  color: string;
  scheduleId: string;
  questions: string;
  requiresConfirmation: boolean;
  hidden: boolean;
};

const LOCATIONS: [string, string][] = [
  ["daily", "Video call (built-in, Daily.co)"],
  ["google_meet", "Google Meet"],
  ["zoom", "Zoom"],
  ["teams", "Microsoft Teams"],
  ["phone", "Phone call"],
  ["in_person", "In person"],
  ["custom", "Custom text / link"],
];

export function EventTypeForm({
  initial,
  schedules,
  publicUrl,
}: {
  initial: Values;
  schedules: { id: string; name: string }[];
  publicUrl: string | null;
}) {
  const [state, action, pending] = useActionState(
    saveEventType,
    {} as { ok?: boolean; error?: string; slug?: string },
  );
  const [loc, setLoc] = useState(initial.locationType);
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  const num = (name: keyof Values, label: string, hint?: string) => (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} name={name} type="number" min={0} defaultValue={String(initial[name])} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
  return (
    <form action={action} className="max-w-3xl space-y-8">
      <input type="hidden" name="id" value={initial.id} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/admin/event-types" className="text-sm text-muted-foreground hover:underline">
            ← Event types
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{initial.title}</h1>
        </div>
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline underline-offset-4"
          >
            Preview ↗
          </a>
        )}
      </div>
      <FieldGroup>
        <div className="grid gap-6 sm:grid-cols-[1fr_200px]">
          <Field>
            <FieldLabel htmlFor="title">Title</FieldLabel>
            <Input id="title" name="title" defaultValue={initial.title} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="slug">URL slug</FieldLabel>
            <Input id="slug" name="slug" defaultValue={initial.slug} />
            <FieldDescription>Last part of the link, e.g. intro-call</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={initial.description}
          />
        </Field>
        <div className="grid gap-6 sm:grid-cols-3">
          {num("durationMin", "Duration (minutes)")}
          {num(
            "slotIntervalMin",
            "Start times every (minutes)",
            "0 = every duration, e.g. 9:00, 9:30 for a 30-minute call",
          )}
          {num("maxPerDay", "Max bookings per day", "0 = unlimited")}
        </div>
        <div className="grid gap-6 sm:grid-cols-4">
          {num("bufferBeforeMin", "Gap before (minutes)", "Kept free before each booking")}
          {num("bufferAfterMin", "Gap after (minutes)", "Kept free after each booking")}
          {num("minNoticeMin", "Minimum notice (minutes)", "e.g. 720 = 12 hours, 1440 = 1 day")}
          {num(
            "maxDaysAhead",
            "Book up to (days ahead)",
            "How far into the future people can book",
          )}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="locationType">Location</FieldLabel>
            <select
              id="locationType"
              name="locationType"
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              className="h-8 rounded-lg border bg-background px-2 text-sm"
            >
              {LOCATIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <FieldDescription>
              Meet, Zoom and Teams links are added automatically once that integration is connected.
              Until then, choose &quot;Custom text / link&quot; and say how you will share the link.
            </FieldDescription>
          </Field>
          {(loc === "phone" || loc === "in_person" || loc === "custom") && (
            <Field>
              <FieldLabel htmlFor="locationValue">
                {loc === "phone"
                  ? "Phone number"
                  : loc === "in_person"
                    ? "Address"
                    : "Text or link"}
              </FieldLabel>
              <Input id="locationValue" name="locationValue" defaultValue={initial.locationValue} />
            </Field>
          )}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="scheduleId">Availability schedule</FieldLabel>
            <select
              id="scheduleId"
              name="scheduleId"
              defaultValue={initial.scheduleId}
              className="h-8 rounded-lg border bg-background px-2 text-sm"
            >
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="color">Color</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="color"
                name="color"
                defaultValue={initial.color}
                className="size-8 cursor-pointer rounded border"
              />
            </div>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="questions">Booking questions</FieldLabel>
          <Textarea
            id="questions"
            name="questions"
            rows={4}
            defaultValue={initial.questions}
            className="font-mono text-xs"
            placeholder={
              "What would you like to discuss? | textarea | required\nCompany | text | optional\nTeam size | select | optional | 1-10,11-50,51+"
            }
          />
          <FieldDescription>
            One per line: Label | text·textarea·email·phone·select | required·optional | options
            (select only, comma-separated). Name and email are always asked.
          </FieldDescription>
        </Field>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="requiresConfirmation"
              defaultChecked={initial.requiresConfirmation}
            />{" "}
            Requires my confirmation
            <span className="text-muted-foreground">(bookings stay pending until you approve)</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="hidden" defaultChecked={initial.hidden} /> Hidden from my
            page (link only)
          </label>
        </div>
        <div className="flex items-center justify-between">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => confirm("Delete this event type?") && deleteEventType(initial.id)}
          >
            Delete
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
