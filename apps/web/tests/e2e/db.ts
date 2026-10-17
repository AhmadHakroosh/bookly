import { createDb, eq, schema } from "@bookly/db";

/*
 * Direct database access for the few e2e cases the UI cannot set up on its own (a Bookly video
 * call needs Daily, which the e2e server does not have). Uses the same DATABASE_URL as the
 * server under test.
 */

export const testDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set for this test");
  return createDb(url);
};

/** Turns a booking (found by the attendee's email) into a Bookly video call that ended `minutesAgo`. */
export async function makePastVideoCall(attendeeEmail: string, room: string, minutesAgo = 30) {
  const db = testDb();
  const [b] = await db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.attendeeEmail, attendeeEmail))
    .limit(1);
  if (!b) throw new Error(`No booking for ${attendeeEmail}`);
  const end = new Date(Date.now() - minutesAgo * 60_000);
  await db
    .update(schema.bookings)
    .set({
      meetingProvider: "daily",
      meetingRef: { room },
      startAt: new Date(end.getTime() - 30 * 60_000),
      endAt: end,
    })
    .where(eq(schema.bookings.id, b.id));
  return b.id;
}
