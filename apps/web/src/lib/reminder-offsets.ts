/**
 * Reminder offsets (minutes before the start) that are due now: inside the offset window, not
 * sent yet, and only when the booking already existed when the offset came up. A booking made
 * three hours before the meeting gets the one-hour reminder but not the "tomorrow" one.
 */
export function dueReminderOffsets(
  offsets: number[],
  booking: { startAt: Date; createdAt: Date; remindersSent: string[] },
  now: Date,
): number[] {
  const minutesLeft = (booking.startAt.getTime() - now.getTime()) / 60_000;
  return offsets.filter(
    (m) =>
      minutesLeft <= m &&
      !booking.remindersSent.includes(`r:${m}`) &&
      booking.createdAt.getTime() <= booking.startAt.getTime() - m * 60_000,
  );
}
