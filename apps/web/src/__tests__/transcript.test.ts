import { describe, expect, it } from "vitest";
import { mergeSegments, parseVtt, renderTranscript } from "@/server/transcript-text";

describe("transcripts", () => {
  it("parses WebVTT cues with and without speaker tags", () => {
    const vtt = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\n<v Ahmad>Hello there\n\n2\n00:01:10.200 --> 00:01:12.000\nplain line\n`;
    expect(parseVtt(vtt)).toEqual([
      { t: 1, speaker: "Ahmad", text: "Hello there" },
      { t: 70.2, speaker: "unknown", text: "plain line" },
    ]);
  });
  it("prefers live lines and fills gaps from the stored file", () => {
    const live = [{ t: 5, speaker: "host", text: "a" }];
    const stored = [
      { t: 6, speaker: "unknown", text: "a again" },
      { t: 90, speaker: "unknown", text: "missed" },
    ];
    expect(mergeSegments(live, stored).map((s) => s.text)).toEqual(["a", "missed"]);
  });
  it("renders with names and clocks", () => {
    expect(
      renderTranscript([{ t: 65, speaker: "attendee", text: "ok" }], { attendee: "Ahmad" }),
    ).toBe("[01:05] Ahmad: ok");
  });
});
