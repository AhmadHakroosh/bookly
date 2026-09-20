import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";
process.env.DAILY_DOMAIN ??= "acme.daily.co";
process.env.DAILY_API_KEY ??= "k";

const { decrypt, encrypt, signState, verifyState } = await import("@/lib/crypto");
const { googleEventBody } = await import("@/server/integrations/google");
const { microsoftEventBody } = await import("@/server/integrations/microsoft");
const { zoomMeetingBody } = await import("@/server/integrations/zoom");
const { dailyRoomBody, meetPageUrl, roomName } = await import("@/server/integrations/daily");
const { authorizeUrl, redirectUri } = await import("@/server/integrations/oauth");

const spec = {
  bookingId: "8d2f1c6e-1111-4222-8333-444455556666",
  title: "Intro call: Ahmad and Sam",
  description: "Hello",
  start: new Date("2026-10-01T09:00:00Z"),
  end: new Date("2026-10-01T09:30:00Z"),
  timezone: "Asia/Jerusalem",
  host: { name: "Ahmad", email: "a@example.com" },
  attendee: { name: "Sam", email: "sam@example.com" },
  meetingUrl: "https://zoom.us/j/1",
};

describe("crypto", () => {
  it("round-trips tokens", () => {
    const c = encrypt("ya29.secret");
    expect(c).not.toContain("secret");
    expect(decrypt(c)).toBe("ya29.secret");
  });
  it("signs and verifies state, rejecting tampering and expiry", () => {
    const s = signState({ u: "u1", w: "w1" });
    expect(verifyState(s)).toEqual({ u: "u1", w: "w1" });
    expect(verifyState(s.slice(0, -2) + "zz")).toBeNull();
    expect(verifyState(signState({ u: "u1" }, -10))).toBeNull();
  });
});

describe("provider payloads", () => {
  it("google: conference request is keyed by booking id", () => {
    const b = googleEventBody(spec, true);
    expect(b.conferenceData?.createRequest.requestId).toBe(`bookly-${spec.bookingId}`);
    expect(b.start.timeZone).toBe("Asia/Jerusalem");
    expect(b.location).toBe("https://zoom.us/j/1");
    expect(googleEventBody(spec, false)).not.toHaveProperty("conferenceData");
  });
  it("microsoft: UTC times without Z and Teams flag only when asked", () => {
    const b = microsoftEventBody(spec, true);
    expect(b.start).toEqual({ dateTime: "2026-10-01T09:00:00.000", timeZone: "UTC" });
    expect(b.isOnlineMeeting).toBe(true);
    expect(microsoftEventBody(spec, false)).not.toHaveProperty("isOnlineMeeting");
  });
  it("zoom: duration in minutes", () => {
    expect(zoomMeetingBody(spec).duration).toBe(30);
    expect(zoomMeetingBody(spec).type).toBe(2);
  });
  it("daily: room name is derived from the booking and expires after the call", () => {
    const b = dailyRoomBody(spec);
    expect(b.name).toBe(roomName(spec.bookingId));
    expect(b.name).toMatch(/^b-[a-z0-9]+$/);
    expect(b.properties.exp).toBe(Math.floor(spec.end.getTime() / 1000) + 7200);
    expect(meetPageUrl(b.name)).toBe(`http://localhost:3002/meet/${b.name}`);
  });
});

describe("oauth", () => {
  it("builds redirect and authorize URLs", () => {
    expect(redirectUri("google")).toBe("http://localhost:3002/api/integrations/google/callback");
    const u = new URL(authorizeUrl("google", "st"));
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toContain("calendar.events");
  });
});
