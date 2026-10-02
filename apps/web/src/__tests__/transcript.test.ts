import { describe, expect, it } from "vitest";
import { languageNames, mergeSegments, parseVtt, renderTranscript } from "@/server/transcript-text";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";
const { detectedLanguages, transcriptionOptions } = await import("@/server/transcripts");

describe("multilingual transcription", () => {
  it("transcribes multilingually unless a language is fixed", () => {
    const auto = transcriptionOptions("auto");
    expect(auto).toMatchObject({
      model: "nova-3",
      language: "multi",
      endpointing: 100,
      includeRawResponse: true,
    });
    expect(transcriptionOptions(undefined)).toEqual(auto);
    expect(transcriptionOptions(null)).toEqual(auto);
    const fixed = transcriptionOptions("de");
    expect(fixed).toMatchObject({ model: "nova-2", language: "de" });
    expect(fixed).not.toHaveProperty("endpointing");
    expect(fixed).not.toHaveProperty("includeRawResponse");
  });
  it("lists the languages spoken, once each, and names them", () => {
    const segs = [{ lang: "en" }, { lang: "es" }, {}, { lang: "en" }, { lang: "he" }];
    expect(detectedLanguages(segs)).toEqual(["en", "es", "he"]);
    expect(languageNames(["en", "es", "he"])).toBe("English, Spanish, Hebrew");
    expect(languageNames(["zz-ZZ"])).toBe("zz-ZZ");
    expect(detectedLanguages([])).toEqual([]);
  });
  it("tags lines with their language only when the call switched languages", () => {
    const mixed = [
      { t: 1, speaker: "host", text: "Hola", lang: "es" },
      { t: 2, speaker: "attendee", text: "Hi", lang: "en" },
    ];
    expect(renderTranscript(mixed)).toBe("[00:01] Host (es): Hola\n[00:02] Attendee (en): Hi");
    const single = mixed.map((s) => ({ ...s, lang: "en" }));
    expect(renderTranscript(single)).toBe("[00:01] Host: Hola\n[00:02] Attendee: Hi");
  });
});

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
