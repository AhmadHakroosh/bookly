import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.APP_URL ??= "http://localhost:3002";

const messages = await import("@/server/messages");

describe("messages helpers", () => {
  it("round-trips the list cursor and refuses anything else", () => {
    const c = { at: "2026-10-17T09:30:00.123Z", id: "3f2c8a10-5b6d-4e7f-8a9b-0c1d2e3f4a5b" };
    expect(messages.decodeThreadCursor(messages.encodeThreadCursor(c))).toEqual(c);
    expect(messages.decodeThreadCursor("")).toBeNull();
    expect(messages.decodeThreadCursor(null)).toBeNull();
    expect(messages.decodeThreadCursor(Buffer.from("nope|x").toString("base64url"))).toBeNull();
    expect(messages.decodeThreadCursor("x".repeat(300))).toBeNull();
  });

  it("puts emails and booking-page notes in the guest's conversation, nothing else", () => {
    expect(messages.isConversationEvent("email_sent", {})).toBe(true);
    expect(messages.isConversationEvent("email_received", {})).toBe(true);
    expect(messages.isConversationEvent("booked", { notes: "Can we talk pricing?" })).toBe(true);
    expect(messages.isConversationEvent("booked", { notes: "  " })).toBe(false);
    expect(messages.isConversationEvent("booked", {})).toBe(false);
    expect(messages.isConversationEvent("note", { text: "internal" })).toBe(false);
    expect(messages.isConversationEvent("task", {})).toBe(false);
  });

  it("tells an email a member wrote from one Bookly sent on its own", () => {
    expect(messages.writtenByMember({ written: true, sentBy: "u1" })).toBe(true);
    expect(messages.writtenByMember({ kind: "reply", sentBy: "u1" })).toBe(true);
    expect(messages.writtenByMember({ kind: "proposal" })).toBe(true);
    // A confirmation names the host so replies reach them, but nobody wrote it.
    expect(messages.writtenByMember({ subject: "Confirmed", sentBy: "u1" })).toBe(false);
    expect(messages.writtenByMember({})).toBe(false);
  });

  it("knows every mailbox the page links to", () => {
    expect(messages.BOXES).toEqual(["inbox", "unread", "guests", "team", "closed"]);
  });
});
