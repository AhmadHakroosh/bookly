import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";
const { assertPublicUrl, isPrivateAddress, mergeIntervals, parseBusy, feedName } =
  await import("@/server/integrations/ics");

const FROM = new Date("2026-10-01T00:00:00Z");
const TO = new Date("2026-12-31T00:00:00Z");

const cal = (body: string) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "X-WR-CALNAME:Work things",
    body,
    "END:VCALENDAR",
  ].join("\r\n");
const iso = (i: { start: Date; end: Date }) => [i.start.toISOString(), i.end.toISOString()];

describe("parseBusy", () => {
  it("takes a UTC event, skips transparent, cancelled and Outlook-free ones", () => {
    const { busy, events } = parseBusy(
      cal(
        [
          "BEGIN:VEVENT",
          "UID:a",
          "DTSTART:20261005T090000Z",
          "DTEND:20261005T100000Z",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:b",
          "DTSTART:20261005T110000Z",
          "DTEND:20261005T120000Z",
          "TRANSP:TRANSPARENT",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:c",
          "DTSTART:20261005T130000Z",
          "DTEND:20261005T140000Z",
          "STATUS:CANCELLED",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:d",
          "DTSTART:20261005T150000Z",
          "DTEND:20261005T160000Z",
          "X-MICROSOFT-CDO-BUSYSTATUS:FREE",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      FROM,
      TO,
    );
    expect(events).toBe(4);
    expect(busy.map(iso)).toEqual([["2026-10-05T09:00:00.000Z", "2026-10-05T10:00:00.000Z"]]);
  });

  it("uses a VTIMEZONE the feed defines", () => {
    const { busy } = parseBusy(
      cal(
        [
          "BEGIN:VTIMEZONE",
          "TZID:Europe/Berlin",
          "BEGIN:STANDARD",
          "DTSTART:19701025T030000",
          "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
          "TZOFFSETFROM:+0200",
          "TZOFFSETTO:+0100",
          "END:STANDARD",
          "BEGIN:DAYLIGHT",
          "DTSTART:19700329T020000",
          "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
          "TZOFFSETFROM:+0100",
          "TZOFFSETTO:+0200",
          "END:DAYLIGHT",
          "END:VTIMEZONE",
          "BEGIN:VEVENT",
          "UID:e",
          "DTSTART;TZID=Europe/Berlin:20261005T090000",
          "DTEND;TZID=Europe/Berlin:20261005T100000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      FROM,
      TO,
    );
    // CEST on 5 October: 09:00 Berlin is 07:00 UTC.
    expect(busy.map(iso)).toEqual([["2026-10-05T07:00:00.000Z", "2026-10-05T08:00:00.000Z"]]);
  });

  it("falls back to the IANA zone when the feed does not define the TZID", () => {
    const { busy } = parseBusy(
      cal(
        [
          "BEGIN:VEVENT",
          "UID:f",
          "DTSTART;TZID=Asia/Jerusalem:20261110T090000",
          "DTEND;TZID=Asia/Jerusalem:20261110T093000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      FROM,
      TO,
    );
    // Standard time in November: 09:00 Jerusalem is 07:00 UTC.
    expect(busy.map(iso)).toEqual([["2026-11-10T07:00:00.000Z", "2026-11-10T07:30:00.000Z"]]);
  });

  it("expands a weekly rule, honours EXDATE and a moved exception, and clips to the window", () => {
    const { busy } = parseBusy(
      cal(
        [
          "BEGIN:VEVENT",
          "UID:r",
          "DTSTART:20260901T120000Z",
          "DTEND:20260901T130000Z",
          "RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=12",
          "EXDATE:20261013T120000Z",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:r",
          "RECURRENCE-ID:20261020T120000Z",
          "DTSTART:20261021T150000Z",
          "DTEND:20261021T160000Z",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      FROM,
      TO,
    );
    const starts = busy.map((b) => b.start.toISOString().slice(0, 16));
    // 6 Oct, (13 Oct excluded), 20 Oct moved to 21 Oct 15:00, 27 Oct, 3, 10, 17 Nov = end of COUNT=12.
    expect(starts).toEqual([
      "2026-10-06T12:00",
      "2026-10-21T15:00",
      "2026-10-27T12:00",
      "2026-11-03T12:00",
      "2026-11-10T12:00",
      "2026-11-17T12:00",
    ]);
  });

  it("treats an all-day opaque event as busy for the whole day and merges overlaps", () => {
    const { busy } = parseBusy(
      cal(
        [
          "BEGIN:VEVENT",
          "UID:g",
          "DTSTART;VALUE=DATE:20261201",
          "DTEND;VALUE=DATE:20261202",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:h",
          "DTSTART:20261201T230000Z",
          "DTEND:20261202T010000Z",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      FROM,
      TO,
    );
    expect(busy.map(iso)).toEqual([["2026-12-01T00:00:00.000Z", "2026-12-02T01:00:00.000Z"]]);
  });

  it("reads the calendar name", () => {
    expect(feedName(cal("BEGIN:VEVENT\r\nUID:x\r\nDTSTART:20261005T090000Z\r\nEND:VEVENT"))).toBe(
      "Work things",
    );
  });
});

describe("mergeIntervals", () => {
  it("coalesces touching and overlapping ranges in order", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
    expect(
      mergeIntervals([
        { start: d(5), end: d(6) },
        { start: d(1), end: d(2) },
        { start: d(2), end: d(3) },
        { start: d(2), end: d(4) },
      ]).map(iso),
    ).toEqual([
      ["2026-10-01T01:00:00.000Z", "2026-10-01T04:00:00.000Z"],
      ["2026-10-01T05:00:00.000Z", "2026-10-01T06:00:00.000Z"],
    ]);
  });
});

describe("feed address guard", () => {
  it("knows the private ranges", () => {
    for (const ip of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.5.5",
      "192.168.1.1",
      "::1",
      "fd00::1",
      "::ffff:10.1.1.1",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "142.250.72.14", "2606:4700::1111"])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("normalises webcal and refuses non-public addresses without touching the network", async () => {
    await expect(assertPublicUrl("webcal://8.8.8.8/cal.ics")).resolves.toMatchObject({
      protocol: "https:",
    });
    await expect(assertPublicUrl("http://localhost:3002/x.ics")).rejects.toThrow(/public host/);
    await expect(assertPublicUrl("https://127.0.0.1/x.ics")).rejects.toThrow(/public host/);
    await expect(assertPublicUrl("https://user:pw@example.com/x.ics")).rejects.toThrow(/password/);
    await expect(assertPublicUrl("ftp://example.com/x.ics")).rejects.toThrow(/https/);
    await expect(assertPublicUrl("not a url")).rejects.toThrow(/valid URL/);
  });
});
