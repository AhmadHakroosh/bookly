import { describe, expect, it } from "vitest";
import { attendeeJoinUrl } from "@/lib/meet-link";

describe("attendee join link", () => {
  it("adds the manage token on Bookly video only", () => {
    const b = {
      meetingUrl: "https://meet.example.com/b-abc",
      meetingProvider: "daily",
      manageToken: "tok1",
    };
    expect(attendeeJoinUrl(b)).toBe("https://meet.example.com/b-abc?t=tok1");
    expect(
      attendeeJoinUrl({ ...b, meetingProvider: "zoom", meetingUrl: "https://zoom.us/j/1" }),
    ).toBe("https://zoom.us/j/1");
    expect(attendeeJoinUrl({ ...b, meetingUrl: null })).toBeNull();
  });
});
