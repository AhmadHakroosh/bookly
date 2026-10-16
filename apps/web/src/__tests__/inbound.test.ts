import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
import {
  htmlToText,
  isAutoReply,
  readReplyAddress,
  replyToken,
  stripQuoted,
  verifySvix,
} from "@/server/inbound";
import { replySubject } from "@/server/outreach-text";
import {
  dayLabel,
  decodeTimelineCursor,
  displayName,
  encodeTimelineCursor,
  tidy,
} from "@/server/timeline";

const ID = "3f2c8a10-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

describe("reply addresses", () => {
  it("round-trip and survive a change of case", () => {
    const addr = `${replyToken(ID)}@reply.example.com`;
    expect(readReplyAddress(addr, "reply.example.com")).toBe(ID);
    expect(readReplyAddress(addr.toUpperCase(), "reply.example.com")).toBe(ID);
    expect(readReplyAddress(`Lina <${addr}>`, "REPLY.example.com")).toBe(ID);
  });
  it("refuse forged, foreign and malformed addresses", () => {
    const token = replyToken(ID);
    expect(
      readReplyAddress(`${token.slice(0, -1)}0@reply.example.com`, "reply.example.com"),
    ).toBeNull();
    expect(readReplyAddress(`${token}@elsewhere.com`, "reply.example.com")).toBeNull();
    expect(readReplyAddress("hello@reply.example.com", "reply.example.com")).toBeNull();
    expect(token.length).toBeLessThanOrEqual(64);
  });
});

describe("webhook signatures (Svix)", () => {
  const secret = `whsec_${Buffer.from("test-secret").toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    `v1,${createHmac("sha256", Buffer.from("test-secret")).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const now = Date.parse("2026-10-16T12:00:00Z");
  const ts = String(now / 1000);
  it("accepts a valid signature among several", () => {
    const body = '{"type":"email.received"}';
    expect(
      verifySvix(
        body,
        { id: "m1", timestamp: ts, signature: `v1,bogus ${sign("m1", ts, body)}` },
        secret,
        now,
      ),
    ).toBe(true);
  });
  it("rejects a changed body, an old timestamp and missing headers", () => {
    const body = "{}";
    expect(
      verifySvix("{ }", { id: "m1", timestamp: ts, signature: sign("m1", ts, body) }, secret, now),
    ).toBe(false);
    const old = String(now / 1000 - 600);
    expect(
      verifySvix(body, { id: "m1", timestamp: old, signature: sign("m1", old, body) }, secret, now),
    ).toBe(false);
    expect(verifySvix(body, { id: null, timestamp: ts, signature: "v1,x" }, secret, now)).toBe(
      false,
    );
  });
});

describe("reading replies", () => {
  it("cuts the quoted history in the usual shapes", () => {
    expect(
      stripQuoted("Sounds good.\n\nOn Fri, Oct 16, 2026 at 10:00 Ann <a@x.com> wrote:\n> hi"),
    ).toBe("Sounds good.");
    expect(
      stripQuoted("Yes\n\nOn Fri, Oct 16, 2026 at 10:00 Ann Lee\n<a@x.com> wrote:\n> hi"),
    ).toBe("Yes");
    expect(stripQuoted("Ok\n-----Original Message-----\nFrom: x")).toBe("Ok");
    expect(stripQuoted("Thanks\nFrom: Ann\nSent: Friday\nTo: me")).toBe("Thanks");
    expect(stripQuoted("> only a quote")).toBe("> only a quote");
  });
  it("never leaves tag fragments, script bodies or doubly decoded entities", () => {
    // The nested opener is one tag; what is left is text with no "<" to start a tag.
    expect(htmlToText("<scr<script>ipt>alert(1)</script>ok")).toBe("ipt>alert(1)ok");
    expect(htmlToText("<<img src=x onerror=alert(1)>>")).not.toContain("<");
    expect(htmlToText("a<script>x</script>b")).toBe("ab");
    expect(htmlToText("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(htmlToText("<p>unclosed <b")).toBe("unclosed");
  });
  it("parses reply addresses without slow patterns", () => {
    const evil = `${"<".repeat(5000)}x@reply.example.com`;
    const t = Date.now();
    expect(readReplyAddress(evil, "reply.example.com")).toBeNull();
    expect(Date.now() - t).toBeLessThan(50);
  });
  it("turns HTML into readable text", () => {
    expect(htmlToText("<p>Hi&nbsp;there</p><p>Line&amp;two<br>three</p><style>x{}</style>")).toBe(
      "Hi there\nLine&two\nthree",
    );
  });
  it("recognises auto-replies", () => {
    expect(isAutoReply({ subject: "Out of office: back Monday", headers: {} })).toBe(true);
    expect(
      isAutoReply({ subject: "Re: Hello", headers: { "Auto-Submitted": "auto-replied" } }),
    ).toBe(true);
    expect(isAutoReply({ subject: "Re: Hello", headers: { "Auto-Submitted": "no" } })).toBe(false);
  });
  it("keeps one Re: however long the thread", () => {
    expect(replySubject("Re: RE: Aw: Proposal")).toBe("Re: Proposal");
    expect(replySubject("Proposal")).toBe("Re: Proposal");
  });
});

describe("timeline pages", () => {
  it("round-trip the keyset cursor", () => {
    const e = { createdAt: new Date("2026-10-16T09:30:00.123Z"), id: ID };
    expect(decodeTimelineCursor(encodeTimelineCursor(e))).toEqual({
      createdAt: "2026-10-16T09:30:00.123Z",
      id: ID,
    });
    expect(decodeTimelineCursor("nope")).toBeNull();
  });
  it("labels days in the viewer's timezone", () => {
    const now = new Date("2026-10-16T22:30:00Z"); // already Saturday in Jerusalem
    expect(dayLabel("2026-10-17", "Asia/Jerusalem", now)).toBe("Today");
    expect(dayLabel("2026-10-16", "Asia/Jerusalem", now)).toBe("Yesterday");
    expect(dayLabel("2026-10-12", "Asia/Jerusalem", now)).toBe("Monday, October 12, 2026");
  });

  it("tidies email text and names senders", () => {
    expect(tidy("Hi  \n\n\n\nThere\n")).toBe("Hi\n\nThere");
    expect(displayName('"Lina Farah" <lina@x.com>')).toBe("Lina Farah");
    expect(displayName("lina@x.com")).toBe("lina@x.com");
  });
});
