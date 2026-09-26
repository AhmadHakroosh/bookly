"use client";

import { useActionState, useState } from "react";
import type { EventQuestion } from "@bookly/db/schema";
import { countryOptions } from "@/lib/phone";
import { book, type BookState } from "./actions";
import { Dropdown } from "@/components/dropdown";

type Props = {
  username: string;
  event: string;
  slot: string;
  tz: string;
  questions: EventQuestion[];
  reschedule?: string;
  defaults?: { name?: string; email?: string };
  paid?: boolean;
  /** Occurrences this booking reserves (recurring event types). */
  sessions?: number;
  /**
   * Ways to meet; with more than one the attendee picks. `capture`: the consent box applies
   * there; `captureAlways`: the call is transcribed and the form says so before booking.
   * `ask`: what the attendee must supply for it (their phone number, or the address to meet at).
   */
  locations: {
    type: string;
    label: string;
    capture: boolean;
    captureAlways?: boolean;
    ask: "phone" | "address" | null;
    note?: string;
  }[];
  /** Preselected type (rescheduling keeps the previous choice). */
  defaultLocation?: string;
  /** ISO country for the phone field, from the visitor's location. */
  defaultCountry: string;
  defaultPhone?: string | null;
  /** Colleagues the attendee may bring (0 = the field is not shown). */
  maxGuests?: number;
};

export function BookingForm({
  username,
  event,
  slot,
  tz,
  questions,
  reschedule,
  defaults,
  paid = false,
  sessions = 1,
  locations,
  defaultLocation,
  defaultCountry,
  defaultPhone,
  maxGuests = 0,
}: Props) {
  const [state, action, pending] = useActionState(book, {} as BookState);
  const [location, setLocation] = useState(
    locations.find((l) => l.type === defaultLocation)?.type ?? locations[0]?.type ?? "",
  );
  const chosen = locations.find((l) => l.type === location);
  const askCapture = !!chosen?.capture;
  const [country, setCountry] = useState(defaultCountry);
  const countries = countryOptions();
  const field =
    "bg-background h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="slot" value={slot} />
      <input type="hidden" name="tz" value={tz} />
      {reschedule && <input type="hidden" name="reschedule" value={reschedule} />}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />
      {locations.length > 1 ? (
        <fieldset className="text-sm">
          <legend className="mb-1 block font-medium">How do you want to meet?</legend>
          <div className="space-y-2">
            {locations.map((l) => (
              <label
                key={l.type}
                className={`flex h-10 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 transition-colors has-focus-visible:ring-2 ${l.type === location ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30"}`}
              >
                <input
                  type="radio"
                  name="location"
                  value={l.type}
                  checked={l.type === location}
                  onChange={() => setLocation(l.type)}
                  className="size-4 accent-primary"
                />
                <span>{l.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="location" value={location} />
      )}
      {chosen?.ask === "phone" && (
        <div className="text-sm">
          <span className="mb-1 block font-medium">
            Phone number
            {chosen.note && (
              <span className="font-normal text-muted-foreground"> · {chosen.note}</span>
            )}
          </span>
          {/* One control: the country (flag and calling code) as an addon joined to the number,
              the way unit addons sit on number fields; the list shows the full country names. */}
          <div className="flex">
            <Dropdown
              name="phoneCountry"
              ariaLabel="Country"
              value={country}
              onValueChange={setCountry}
              className="w-auto shrink-0 rounded-r-none border-r-0 bg-muted px-2.5 text-muted-foreground data-[size=default]:h-10"
              contentClassName="max-h-80"
              renderValue={(code) => {
                const c = countries.find((x) => x.code === code);
                return c ? `${c.flag} ${c.calling}` : code;
              }}
              options={countries.map((c) => ({
                value: c.code,
                label: `${c.flag} ${c.name} ${c.calling}`,
              }))}
            />
            <input
              name="phone"
              type="tel"
              required
              autoComplete="tel-national"
              inputMode="tel"
              aria-label="Phone number"
              defaultValue={defaultPhone ?? undefined}
              placeholder="201 555 0123"
              className={`${field} min-w-0 flex-1 rounded-l-none`}
            />
          </div>
        </div>
      )}
      {chosen?.ask === "address" && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Where should we meet?</span>
          <input
            name="address"
            required
            autoComplete="street-address"
            placeholder="Street, city"
            className={field}
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input
          name="name"
          required
          autoComplete="name"
          defaultValue={defaults?.name}
          className={field}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaults?.email}
          className={field}
        />
      </label>
      {questions.map((q) => (
        <label key={q.id} className="block text-sm">
          <span className="mb-1 block font-medium">
            {q.label}
            {q.required ? (
              ""
            ) : (
              <span className="font-normal text-muted-foreground"> (optional)</span>
            )}
          </span>
          {q.type === "textarea" ? (
            <textarea
              name={`q_${q.id}`}
              required={q.required}
              rows={3}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          ) : q.type === "select" ? (
            <Dropdown
              name={`q_${q.id}`}
              required={q.required}
              className="h-10"
              ariaLabel={q.label}
              options={(q.options ?? []).map((o) => ({ value: o, label: o }))}
            />
          ) : (
            <input
              name={`q_${q.id}`}
              type={q.type === "email" ? "email" : q.type === "phone" ? "tel" : "text"}
              required={q.required}
              className={field}
            />
          )}
        </label>
      ))}
      {maxGuests > 0 && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            Bring colleagues <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <textarea
            name="guests"
            rows={2}
            placeholder={`One email per line, up to ${maxGuests}`}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            They get the calendar invitation and the reminders; only you can change or cancel it.
          </span>
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">
          Anything to prepare? <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
        />
      </label>
      {chosen?.captureAlways && (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground" role="note">
          This call is transcribed so both sides get notes and action items afterwards. Everyone who
          joins is told at the start, and you can delete the transcript from your booking page at
          any time. By booking you agree to this.
        </p>
      )}
      {askCapture && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="captureConsent" className="mt-1" />
          <span>
            Transcribe the call so we both get notes and action items afterwards.{" "}
            <span className="text-muted-foreground">
              (optional; the transcript can be deleted later)
            </span>
          </span>
        </label>
      )}
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending
          ? "Booking…"
          : reschedule
            ? "Confirm new time"
            : paid
              ? "Continue to payment"
              : sessions > 1
                ? `Book ${sessions} sessions`
                : "Confirm booking"}
      </button>
    </form>
  );
}
