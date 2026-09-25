import { describe, expect, it } from "vitest";
import { groupSessions, sessionKey } from "@/server/sessions";

const at = (iso: string) => new Date(iso);
const row = (
  id: string,
  over: Partial<{
    eventTypeId: string;
    hostUserId: string;
    startAt: Date;
    status: string;
    eventSeats: number | null;
  }> = {},
) => ({
  id,
  eventTypeId: "et_group",
  hostUserId: "u_host",
  startAt: at("2026-10-06T14:30:00Z"),
  status: "confirmed",
  eventSeats: 3,
  ...over,
});

describe("groupSessions", () => {
  it("folds the bookings of one group session into one item, counting active seats", () => {
    const rows = [
      row("a"),
      row("b", { status: "pending" }),
      row("c", { status: "cancelled" }),
      row("d", { startAt: at("2026-10-13T14:30:00Z") }),
    ];
    const groups = groupSessions(rows);
    expect(groups).toHaveLength(2);
    const first = groups[0]!;
    expect(first.kind).toBe("session");
    if (first.kind !== "session") return;
    expect(first.seats).toBe(3);
    expect(first.taken).toBe(2);
    expect(first.bookings.map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(first.key).toBe(sessionKey(rows[0]!));
  });
  it("keeps one-to-one bookings as single items in their original order", () => {
    const rows = [
      row("solo1", { eventTypeId: "et_intro", eventSeats: 1 }),
      row("g1"),
      row("solo2", { eventTypeId: "et_intro", eventSeats: null }),
      row("g2"),
    ];
    expect(groupSessions(rows).map((g) => g.kind)).toEqual(["single", "session", "single"]);
  });
  it("treats the same start with a different host as a different session", () => {
    const rows = [row("a"), row("b", { hostUserId: "u_other" })];
    expect(groupSessions(rows)).toHaveLength(2);
  });
});
