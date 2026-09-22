"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { BackLink, ExternalLink } from "@/components/links";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EventQuestion, FollowUp, Recurrence } from "@bookly/db/schema";
import { deleteEventType, saveEventType } from "../../scheduling-actions";
import { QuestionBuilder } from "./question-builder";

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
  requiresConfirmation: boolean;
  hidden: boolean;
  priceCents: number;
  currency: string;
  remindByText: boolean;
  questionsList: EventQuestion[];
  reminders: string;
  followUp: FollowUp;
  assignment: "single" | "round_robin" | "collective";
  hostUserIds: string[];
  seats: number;
  recurrence: Recurrence;
  autoCapture: "off" | "ask" | "always";
};

const LOCATIONS: [string, string][] = [
  ["daily", "Video call (built-in)"],
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
};

export function EventTypeForm({
  initial,
  schedules,
  publicUrl,
  ready,
  paymentsReady,
  paymentsHint = "",
  notetaker = false,
  teammates,
}: {
  initial: Values;
  schedules: { id: string; name: string }[];
  publicUrl: string | null;
  ready: ConferencingReady;
  paymentsReady: boolean;
  /** Why paid bookings are off, shown under the price field. */
  paymentsHint?: string;
  /** A notetaker is configured, so Meet, Teams and Zoom calls can be transcribed too. */
  notetaker?: boolean;
  teammates: { userId: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    saveEventType,
    {} as { ok?: boolean; error?: string; slug?: string },
  );
  const [loc, setLoc] = useState(initial.locationType);
  const [assignment, setAssignment] = useState(initial.assignment);
  const [repeats, setRepeats] = useState(!!initial.recurrence.enabled);
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
          <BackLink href="/admin/event-types">Event types</BackLink>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{initial.title}</h1>
        </div>
        {publicUrl && <ExternalLink href={publicUrl}>Preview</ExternalLink>}
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
        <div className="grid gap-6 sm:grid-cols-4">
          {num("durationMin", "Duration (minutes)")}
          {num(
            "slotIntervalMin",
            "Start times every (minutes)",
            "0 = every duration, e.g. 9:00, 9:30 for a 30-minute call",
          )}
          {num("maxPerDay", "Max bookings per day", "0 = unlimited")}
          <Field>
            <FieldLabel htmlFor="seats">Seats per slot</FieldLabel>
            <Input
              id="seats"
              name="seats"
              type="number"
              min={1}
              max={500}
              defaultValue={String(initial.seats)}
            />
            <FieldDescription>
              More than 1 makes this a group session: the same time can be booked until it is full
              and everyone gets the same meeting link.
            </FieldDescription>
          </Field>
        </div>
        {(loc === "daily" || (notetaker && ["zoom", "google_meet", "teams"].includes(loc))) && (
          <Field>
            <FieldLabel htmlFor="autoCapture">Auto-capture</FieldLabel>
            <select
              id="autoCapture"
              name="autoCapture"
              defaultValue={initial.autoCapture}
              className="h-8 rounded-lg border bg-background px-2 text-sm"
            >
              <option value="off">Off</option>
              <option value="ask">Ask the attendee when booking</option>
              <option value="always">Always (stated in the confirmation email)</option>
            </select>
            <FieldDescription>
              {loc === "daily"
                ? "Transcribes the call and prepares notes, action items and a follow-up for you to review. Both sides see a notice in the call."
                : "A notetaker named in the invitation joins the call, transcribes it and prepares notes, action items and a follow-up for you to review. Admit it from the waiting room if your meeting has one."}
            </FieldDescription>
          </Field>
        )}
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-base font-semibold tracking-tight">
            Recurring bookings
          </legend>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="recurEnabled"
              checked={repeats}
              onChange={(e) => setRepeats(e.target.checked)}
            />{" "}
            One booking reserves a series of sessions
          </label>
          {repeats && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="recurFreq">Repeats</FieldLabel>
                <select
                  id="recurFreq"
                  name="recurFreq"
                  defaultValue={initial.recurrence.freq ?? "weekly"}
                  className="h-8 rounded-lg border bg-background px-2 text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="recurInterval">Every</FieldLabel>
                <Input
                  id="recurInterval"
                  name="recurInterval"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={String(initial.recurrence.interval ?? 1)}
                />
                <FieldDescription>2 = every second week/day/month</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="recurCount">Sessions</FieldLabel>
                <Input
                  id="recurCount"
                  name="recurCount"
                  type="number"
                  min={2}
                  max={52}
                  defaultValue={String(initial.recurrence.count ?? 4)}
                />
                <FieldDescription>Total, including the first. Max 52.</FieldDescription>
              </Field>
            </div>
          )}
          <FieldDescription>
            Attendees pick the first time and get every session in one confirmation. Dates the host
            cannot take are skipped. With a price, the whole series is paid in one checkout.
          </FieldDescription>
        </fieldset>
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
              {LOCATIONS.map(([v, l]) => {
                const conf = v in ready ? ready[v as keyof ConferencingReady] : null;
                return (
                  <option key={v} value={v}>
                    {l}
                    {conf === false ? (v === "daily" ? " — not set up" : " — not connected") : ""}
                  </option>
                );
              })}
            </select>
            <FieldDescription>
              {loc in ready && !ready[loc as keyof ConferencingReady]
                ? "This provider is not connected yet. Bookings fall back to Bookly video if available, otherwise the email says the link follows. Set it up under Calendars / Conferencing."
                : loc in ready
                  ? "A meeting link is created automatically for every confirmed booking."
                  : "Shown to attendees in the confirmation email and calendar invite."}
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
        <div className="grid gap-6 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="price">Price</FieldLabel>
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={(initial.priceCents / 100).toFixed(2)}
            />
            <FieldDescription>
              {paymentsReady
                ? "0 = free. Paid bookings go through Stripe Checkout before they are confirmed."
                : paymentsHint}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="currency">Currency</FieldLabel>
            <Input
              id="currency"
              name="currency"
              defaultValue={initial.currency}
              placeholder="usd"
            />
          </Field>
        </div>
        <Field>
          <FieldLabel>Booking questions</FieldLabel>
          <QuestionBuilder initial={initial.questionsList} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="reminders">Remind attendees (minutes before)</FieldLabel>
            <Input
              id="reminders"
              name="reminders"
              defaultValue={initial.reminders}
              placeholder="1440, 60"
            />
            <FieldDescription>Comma-separated. 1440 = one day, 60 = one hour.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="assignment">Who hosts</FieldLabel>
            <select
              id="assignment"
              name="assignment"
              value={assignment}
              onChange={(e) => setAssignment(e.target.value as Values["assignment"])}
              className="h-8 rounded-lg border bg-background px-2 text-sm"
            >
              <option value="single">Just me</option>
              <option value="round_robin">Round robin (one of the hosts, evenly)</option>
              <option value="collective">Collective (all hosts together)</option>
            </select>
            {assignment !== "single" && (
              <div className="mt-2 space-y-1 text-sm">
                {teammates.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Invite teammates under Team first.
                  </p>
                )}
                {teammates.map((t) => (
                  <label key={t.userId} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="hostUserIds"
                      value={t.userId}
                      defaultChecked={initial.hostUserIds.includes(t.userId)}
                    />
                    {t.name}
                  </label>
                ))}
                <FieldDescription>
                  {assignment === "round_robin"
                    ? "Slots are offered when any host is free; the least busy free host takes the booking."
                    : "Slots are offered only when every host is free; the booking goes on your calendar."}
                </FieldDescription>
              </div>
            )}
          </Field>
        </div>
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-base font-semibold tracking-tight">
            Follow-up email after the meeting
          </legend>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="followUpEnabled"
              defaultChecked={initial.followUp.enabled}
            />{" "}
            Send a follow-up
          </label>
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <Field>
              <FieldLabel htmlFor="followUpDelay">Hours after the end</FieldLabel>
              <Input
                id="followUpDelay"
                name="followUpDelay"
                type="number"
                min={0}
                step="0.5"
                defaultValue={String((initial.followUp.delayMin ?? 60) / 60)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="followUpSubject">Subject</FieldLabel>
              <Input
                id="followUpSubject"
                name="followUpSubject"
                defaultValue={initial.followUp.subject ?? ""}
                placeholder="Thanks for your time, {name}"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="followUpBody">Message</FieldLabel>
            <Textarea
              id="followUpBody"
              name="followUpBody"
              rows={4}
              defaultValue={initial.followUp.body ?? ""}
              placeholder={"Hi {name},\n\nThanks for the {event} today…"}
            />
            <FieldDescription>
              Placeholders: {"{name} {host} {event} {bookingUrl}"}
            </FieldDescription>
          </Field>
        </fieldset>
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
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="remindByText" defaultChecked={initial.remindByText} /> Text
            reminders to attendees who leave a phone number
          </label>
        </div>
        <div className="flex items-center justify-between">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => confirm("Delete this event type?") && deleteEventType(initial.id)}
          >
            Delete
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
