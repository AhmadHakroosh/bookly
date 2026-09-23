import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const {
  parseRecallTranscript,
  segmentFromUtterance,
  speakerLabel,
  signatureHeaders,
  verifySvix,
  tokenMatches,
} = await import("@/server/integrations/notetaker");

describe("notetaker transcript parsing", () => {
  it("labels the host, the attendee by name, and anyone else by their name", () => {
    expect(speakerLabel({ name: "Ahmad", is_host: true }, "Sam Lee")).toBe("host");
    expect(speakerLabel({ name: "sam lee", is_host: false }, "Sam Lee")).toBe("attendee");
    expect(speakerLabel({ name: "Guest 2", is_host: false }, "Sam Lee")).toBe("Guest 2");
    expect(speakerLabel(null, "Sam Lee")).toBe("attendee");
  });
  it("turns a real-time utterance into a segment at the first word's time", () => {
    const seg = segmentFromUtterance(
      {
        participant: { name: "Sam Lee", is_host: false },
        words: [
          { text: "let's", start_timestamp: { relative: 12.34 } },
          { text: "start", start_timestamp: { relative: 12.8 } },
        ],
      },
      "Sam Lee",
    );
    expect(seg).toEqual({ t: 12.3, speaker: "attendee", text: "let's start" });
    expect(segmentFromUtterance({ words: [] }, "x")).toBeNull();
  });
  it("orders the stored transcript by time", () => {
    const segs = parseRecallTranscript(
      [
        {
          participant: { name: "Ahmad", is_host: true },
          words: [{ text: "hi", start_timestamp: { relative: 5 } }],
        },
        {
          participant: { name: "Sam", is_host: false },
          words: [{ text: "hello", start_timestamp: { relative: 1 } }],
        },
      ],
      "Sam",
    );
    expect(segs.map((s) => `${s.t}:${s.speaker}:${s.text}`)).toEqual([
      "1:attendee:hello",
      "5:host:hi",
    ]);
    expect(parseRecallTranscript({ nope: true }, "Sam")).toEqual([]);
  });
});

describe("webhook verification", () => {
  const secret = `whsec_${Buffer.from("top-secret-key").toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    createHmac("sha256", Buffer.from("top-secret-key"))
      .update(`${id}.${ts}.${body}`)
      .digest("base64");
  it("accepts a valid Svix signature and rejects a tampered body or stale timestamp", () => {
    const body = '{"event":"bot.done"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = { id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}` };
    expect(verifySvix(secret, headers, body)).toBe(true);
    expect(verifySvix(secret, headers, body + " ")).toBe(false);
    // Workspace-secret requests carry webhook-* headers; Svix deliveries carry svix-* (or both).
    const ws = signatureHeaders(
      new Headers({
        "webhook-id": headers.id!,
        "webhook-timestamp": headers.timestamp!,
        "webhook-signature": headers.signature!,
      }),
    );
    expect(verifySvix(secret, ws, body)).toBe(true);
    expect(signatureHeaders(new Headers({ "svix-id": "x" })).id).toBe("x");
    expect(signatureHeaders(new Headers()).signature).toBeNull();
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect(
      verifySvix(
        secret,
        { ...headers, timestamp: old, signature: `v1,${sign("msg_1", old, body)}` },
        body,
      ),
    ).toBe(false);
    expect(verifySvix(secret, { id: null, timestamp: ts, signature: "v1,x" }, body)).toBe(false);
  });
  it("compares per-booking tokens in constant time", () => {
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abd", "abc")).toBe(false);
    expect(tokenMatches(null, "abc")).toBe(false);
  });
});
