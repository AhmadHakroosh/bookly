"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { isValidTimezone } from "@/lib/time";
import { BookingError, createBooking } from "@/server/booking-flow";
import { createCheckout } from "@/server/payments";
import { getEventType, getProfileByUsername } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";

const schema = z.object({
  username: z.string().min(1),
  event: z.string().min(1),
  slot: z.string().min(1),
  tz: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  reschedule: z.string().optional(),
  website: z.string().max(0).optional(),
});

export type BookState = { error?: string };

export async function book(_prev: BookState, formData: FormData): Promise<BookState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Please check your name and email." };
  const d = parsed.data;
  if (d.website) redirect("/");
  if (!isValidTimezone(d.tz)) return { error: "Unknown timezone." };
  const start = new Date(d.slot);
  if (Number.isNaN(start.getTime())) return { error: "Invalid time." };
  const ws = await getCurrentWorkspace();
  const profile = ws ? await getProfileByUsername(ws.id, d.username) : null;
  const et = ws && profile ? await getEventType(ws.id, profile.userId, d.event) : null;
  if (!ws || !profile || !et) return { error: "This booking page no longer exists." };
  const answers: Record<string, string> = {};
  for (const q of et.questions) answers[q.id] = (raw[`q_${q.id}`] ?? "").slice(0, 2000);
  let token: string;
  let skipped = 0;
  try {
    const b = await createBooking(ws, et, {
      start,
      timezone: d.tz,
      name: d.name,
      email: d.email,
      phone: d.phone,
      notes: d.notes,
      answers,
      rescheduleToken: d.reschedule || null,
    });
    token = b.manageToken;
    skipped = b.skipped?.length ?? 0;
    if (b.status === "awaiting_payment") {
      const url = await createCheckout(ws, b, et);
      redirect(url);
    }
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof BookingError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/booking/${token}?new=1${skipped ? `&skipped=${skipped}` : ""}`);
}
