import { describe, expect, it } from "vitest";
import { ago } from "@/lib/time";
import { KIND_KEYS, KINDS, channelsFor, decodeCursor, encodeCursor } from "@/server/notifications";
import { deviceLabel } from "@/server/push";

describe("notification preferences", () => {
  it("falls back to each kind's defaults", () => {
    for (const k of KIND_KEYS) {
      const c = channelsFor({}, k);
      if (k === "guest.joined") expect(c.email).toBe(true);
      else if (k === "task.overdue") expect(c.email).toBe(false);
      else expect(c).toEqual(KINDS[k].defaults);
    }
  });

  it("keeps the two emails that used to follow a text switch until the member chooses", () => {
    expect(channelsFor({ onJoin: false }, "guest.joined").email).toBe(false);
    expect(channelsFor({ reminder1h: true }, "task.overdue").email).toBe(true);
    expect(
      channelsFor({ onJoin: false, kinds: { "guest.joined": { email: true } } }, "guest.joined")
        .email,
    ).toBe(true);
  });

  it("saved choices win per channel, unsaved channels keep their default", () => {
    const c = channelsFor({ kinds: { "booking.created": { desktop: false } } }, "booking.created");
    expect(c).toEqual({ inApp: true, desktop: false, email: true });
  });

  it("every kind has a label and a hint for the settings grid", () => {
    for (const k of KIND_KEYS) {
      expect(KINDS[k].label.length).toBeGreaterThan(3);
      expect(KINDS[k].hint.endsWith(".")).toBe(true);
    }
  });
});

describe("notification cursors", () => {
  it("round-trip and reject junk", () => {
    const n = { createdAt: new Date("2026-10-16T10:00:00.123Z"), id: "abc-123" };
    expect(decodeCursor(encodeCursor(n))).toEqual({
      createdAt: "2026-10-16T10:00:00.123Z",
      id: "abc-123",
    });
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });
});

describe("helpers", () => {
  it("names devices from the user agent", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
      ),
    ).toBe("Firefox on Windows");
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iOS");
    expect(deviceLabel(null)).toBe("Browser");
  });

  it("says how long ago, briefly", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(ago("2026-10-16T11:59:40Z", now)).toBe("just now");
    expect(ago("2026-10-16T11:55:00Z", now)).toBe("5 min. ago");
    expect(ago("2026-10-16T09:00:00Z", now)).toBe("3 hr. ago");
    expect(ago("2026-10-15T12:00:00Z", now)).toBe("yesterday");
    expect(ago("2026-10-01T12:00:00Z", now)).toBe("Oct 1");
  });
});
