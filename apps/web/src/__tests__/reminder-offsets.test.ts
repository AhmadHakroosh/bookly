import { describe, expect, it } from "vitest";
import { dueReminderOffsets } from "@/lib/reminder-offsets";

const at = (iso: string) => new Date(iso);
const start = at("2026-10-06T15:00:00Z");

describe("dueReminderOffsets", () => {
  it("skips the day-before reminder for a booking made the same day", () => {
    const b = { startAt: start, createdAt: at("2026-10-06T12:00:00Z"), remindersSent: [] };
    expect(dueReminderOffsets([1440, 60], b, at("2026-10-06T12:01:00Z"))).toEqual([]);
    expect(dueReminderOffsets([1440, 60], b, at("2026-10-06T14:10:00Z"))).toEqual([60]);
  });
  it("sends the day-before reminder when the booking predates it", () => {
    const b = { startAt: start, createdAt: at("2026-10-01T09:00:00Z"), remindersSent: [] };
    expect(dueReminderOffsets([1440, 60], b, at("2026-10-05T15:05:00Z"))).toEqual([1440]);
  });
  it("never repeats an offset already sent", () => {
    const b = { startAt: start, createdAt: at("2026-10-01T09:00:00Z"), remindersSent: ["r:1440"] };
    expect(dueReminderOffsets([1440, 60], b, at("2026-10-06T14:30:00Z"))).toEqual([60]);
  });
});
