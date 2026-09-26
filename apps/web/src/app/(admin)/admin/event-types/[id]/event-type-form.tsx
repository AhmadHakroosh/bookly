"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { BackLink, ExternalLink } from "@/components/links";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EventLocation, EventQuestion, FollowUp, Recurrence } from "@bookly/db/schema";
import { useRouter } from "next/navigation";
import { deleteEventType, saveEventType, type EventTypeSaveState } from "../../scheduling-actions";
import { QuestionBuilder } from "./question-builder";
import { LocationsEditor, type ConferencingReady } from "./locations-editor";
import { Dropdown } from "@/components/dropdown";
import { ColorPicker } from "@/components/color-picker";
import { NumberField } from "@/components/number-field";

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
  maxGuests: number;
  locations: EventLocation[];
  color: string;
  scheduleId: string;
  requiresConfirmation: boolean;
  hidden: boolean;
  waitlistEnabled: boolean;
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
  schedules: { id: string; name: string; isDefault?: boolean }[];
  publicUrl: string | null;
  ready: ConferencingReady;
  paymentsReady: boolean;
  /** Why paid bookings are off, shown under the price field. */
  paymentsHint?: string;
  /** A notetaker is configured, so Meet, Teams and Zoom calls can be transcribed too. */
  notetaker?: boolean;
  teammates: { userId: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveEventType, {} as EventTypeSaveState);
  const [locs, setLocs] = useState<EventLocation[]>(initial.locations);
  const types = locs.map((l) => l.type);
  const captureable = types.some(
    (t) => t === "daily" || (notetaker && ["zoom", "google_meet", "teams"].includes(t)),
  );
  const [assignment, setAssignment] = useState(initial.assignment);
  const [repeats, setRepeats] = useState(!!initial.recurrence.enabled);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error && state.upgradeTo)
      // A plan limit: the toast carries the way out.
      toast.error(state.error, {
        duration: 8000,
        action: { label: "Upgrade", onClick: () => router.push("/admin/billing") },
      });
    else if (state.error) toast.error(state.error);
  }, [state, router]);
  // Numeric fields in a row: single-line labels so the inputs line up, and the unit as an
  // addon joined to the field, outside the input so it never sits over the spinner arrows.
  const num = (name: keyof Values, label: string, unit: string, hint?: string) => (
    <Field>
      <FieldLabel htmlFor={name} className="whitespace-nowrap">
        {label}
      </FieldLabel>
      <NumberField
        id={name}
        name={name}
        min={0}
        defaultValue={initial[name] as number}
        unit={unit}
      />
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
          {num("durationMin", "Duration", "min")}
          {num(
            "slotIntervalMin",
            "Start times every",
            "min",
            "0 = every duration, e.g. 9:00, 9:30 for a 30-minute call",
          )}
          {num("maxPerDay", "Max bookings", "per day", "0 = unlimited")}
          <Field>
            <FieldLabel htmlFor="seats" className="whitespace-nowrap">
              Seats per slot
            </FieldLabel>
            <NumberField
              id="seats"
              name="seats"
              min={1}
              max={500}
              defaultValue={initial.seats}
              unit="seats"
            />
            <FieldDescription>
              More than 1 makes this a group session: the same time can be booked until it is full
              and everyone gets the same meeting link.
            </FieldDescription>
          </Field>
        </div>
        {captureable && (
          <Field>
            <FieldLabel htmlFor="autoCapture">Auto-capture</FieldLabel>
            <Dropdown
              id="autoCapture"
              name="autoCapture"
              defaultValue={initial.autoCapture}
              options={[
                { value: "off", label: "Off" },
                { value: "ask", label: "Ask the attendee when booking" },
                { value: "always", label: "Always (stated in the confirmation email)" },
              ]}
            />
            <FieldDescription>
              {types.every((t) => t === "daily" || !["zoom", "google_meet", "teams"].includes(t))
                ? "Transcribes the call and prepares notes, action items and a follow-up for you to review. Both sides see a notice in the call."
                : "Transcribes the call and prepares notes, action items and a follow-up for you to review. On Bookly video both sides see a notice in the call; on Meet, Teams and Zoom a notetaker named in the invitation joins, so admit it from the waiting room if your meeting has one."}
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
                <Dropdown
                  id="recurFreq"
                  name="recurFreq"
                  defaultValue={initial.recurrence.freq ?? "weekly"}
                  options={[
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="recurInterval">Every</FieldLabel>
                <NumberField
                  id="recurInterval"
                  name="recurInterval"
                  min={1}
                  max={12}
                  defaultValue={initial.recurrence.interval ?? 1}
                />
                <FieldDescription>2 = every second week/day/month</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="recurCount">Sessions</FieldLabel>
                <NumberField
                  id="recurCount"
                  name="recurCount"
                  min={2}
                  max={52}
                  defaultValue={initial.recurrence.count ?? 4}
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
        <div className="grid gap-6 sm:grid-cols-5">
          {num("bufferBeforeMin", "Gap before", "min", "Kept free before each booking")}
          {num("bufferAfterMin", "Gap after", "min", "Kept free after each booking")}
          {num("minNoticeMin", "Minimum notice", "min", "e.g. 720 = 12 hours, 1440 = 1 day")}
          {num("maxDaysAhead", "Book up to", "days", "How far into the future people can book")}
          {num("maxGuests", "Guests", "per booking", "Colleagues the attendee may bring; 0 = none")}
        </div>
        <Field>
          <FieldLabel>Where to meet</FieldLabel>
          <LocationsEditor initial={initial.locations} ready={ready} onChange={setLocs} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="scheduleId">Availability schedule</FieldLabel>
            <Dropdown
              id="scheduleId"
              name="scheduleId"
              defaultValue={initial.scheduleId}
              options={schedules.map((s) => ({
                value: s.id,
                label: `${s.name}${s.isDefault ? " (default)" : ""}`,
              }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="color">Color</FieldLabel>
            <ColorPicker id="color" name="color" defaultValue={initial.color} required />
            <FieldDescription>
              Marks this event type on your booking page and in lists.
            </FieldDescription>
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="price">Price</FieldLabel>
            <NumberField
              id="price"
              name="price"
              min={0}
              step={1}
              decimals={2}
              defaultValue={initial.priceCents / 100}
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
            <Dropdown
              id="assignment"
              name="assignment"
              value={assignment}
              onValueChange={(v) => setAssignment(v as Values["assignment"])}
              options={[
                { value: "single", label: "Just me" },
                { value: "round_robin", label: "Round robin (one of the hosts, evenly)" },
                { value: "collective", label: "Collective (all hosts together)" },
              ]}
            />
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
              <NumberField
                id="followUpDelay"
                name="followUpDelay"
                min={0}
                step={0.5}
                defaultValue={(initial.followUp.delayMin ?? 60) / 60}
                unit="h"
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
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="waitlist" defaultChecked={initial.waitlistEnabled} />{" "}
            Waitlist
            <span className="text-muted-foreground">
              (full sessions and empty days offer &ldquo;tell me when a spot opens&rdquo;)
            </span>
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
