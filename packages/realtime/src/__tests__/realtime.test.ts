import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_ENVELOPE_BYTES,
  TICKET_TTL_MS,
  channels,
  channelsFor,
  decodeEnvelope,
  encodeEnvelope,
  signTicket,
  socketUrl,
  ticketKey,
  verifyTicket,
} from "../index.ts";

const key = ticketKey("test-secret-test-secret-test");
const now = Date.parse("2026-10-24T12:00:00Z");

describe("tickets", () => {
  it("round-trip a member's claims", () => {
    const t = signTicket(key, { ws: "ws1", sub: "m:user1" }, now);
    expect(verifyTicket(key, t, now + 1000)).toEqual({
      v: 1,
      ws: "ws1",
      sub: "m:user1",
      exp: now + TICKET_TTL_MS,
    });
  });

  it("expire after a minute", () => {
    const t = signTicket(key, { ws: "ws1", sub: "m:user1" }, now);
    expect(verifyTicket(key, t, now + TICKET_TTL_MS + 1)).toBeNull();
  });

  it("refuse another secret, a changed body and junk", () => {
    const t = signTicket(key, { ws: "ws1", sub: "m:user1" }, now);
    expect(verifyTicket(ticketKey("another-secret-another-secret"), t, now)).toBeNull();
    const [body, mac] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ v: 1, ws: "ws2", sub: "m:user1", exp: now + TICKET_TTL_MS }),
    ).toString("base64url");
    expect(verifyTicket(key, `${forged}.${mac}`, now)).toBeNull();
    expect(verifyTicket(key, `${body}.${mac}.x`, now)).toBeNull();
    for (const junk of ["", "abc", ".", null, undefined, 42, "x".repeat(2000)])
      expect(verifyTicket(key, junk, now)).toBeNull();
  });

  it("refuse a subject that is neither a member nor a guest", () => {
    const body = Buffer.from(
      JSON.stringify({ v: 1, ws: "ws1", sub: "admin", exp: now + 1000 }),
    ).toString("base64url");
    const mac = createHmac("sha256", key).update(body).digest("base64url");
    expect(verifyTicket(key, `${body}.${mac}`, now)).toBeNull();
  });
});

describe("channels", () => {
  it("a member hears their own channel and the workspace's", () => {
    expect(channelsFor({ ws: "ws1", sub: "m:u1" })).toEqual([
      channels.member("ws1", "u1"),
      channels.members("ws1"),
    ]);
  });

  it("a guest hears only their own channel", () => {
    expect(channelsFor({ ws: "ws1", sub: "g:c1" })).toEqual([channels.guest("ws1", "c1")]);
  });

  it("keep workspaces apart", () => {
    expect(channels.member("ws1", "u1")).not.toBe(channels.member("ws2", "u1"));
    expect(channels.members("ws1")).not.toBe(channels.members("ws2"));
  });
});

describe("envelopes", () => {
  it("round-trip", () => {
    const e = encodeEnvelope(["m:ws:u"], "count", { unread: 2 });
    expect(decodeEnvelope(e)).toEqual({ to: ["m:ws:u"], e: "count", d: { unread: 2 } });
  });

  it("stay under the pg_notify limit by becoming a refresh hint", () => {
    const e = encodeEnvelope(["m:ws:u"], "notification", { body: "x".repeat(20_000) });
    expect(Buffer.byteLength(e)).toBeLessThanOrEqual(MAX_ENVELOPE_BYTES);
    expect(decodeEnvelope(e)?.d).toEqual({ refresh: true });
  });

  it("ignore what is not an envelope", () => {
    for (const p of [undefined, "", "nope", "{}", '{"to":"x","e":"count"}'])
      expect(decodeEnvelope(p)).toBeNull();
  });
});

describe("socket URL", () => {
  it("defaults to the app's own /realtime with an in-process server", () => {
    expect(socketUrl({ REALTIME_PORT: "3003" })).toBe("/realtime");
  });

  it("follows REALTIME_URL, and is off without either", () => {
    expect(socketUrl({ REALTIME_URL: "wss://rt.example.com", REALTIME_PORT: "3003" })).toBe(
      "wss://rt.example.com",
    );
    expect(socketUrl({ REALTIME_URL: "https://nope.example.com" })).toBeNull();
    expect(socketUrl({})).toBeNull();
  });
});
