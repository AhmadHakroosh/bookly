import { describe, expect, it } from "vitest";
import { senderFor } from "@bookly/email";

describe("senderFor", () => {
  it("puts the person's name in front of the platform name at the platform address", () => {
    expect(senderFor("Ahmad Hakroosh", "Bookly <noreply@bookly-app.io>")).toBe(
      '"Ahmad Hakroosh via Bookly" <noreply@bookly-app.io>',
    );
    expect(senderFor("Ahmad Hakroosh", "noreply@bookly-app.io")).toBe(
      '"Ahmad Hakroosh via Bookly" <noreply@bookly-app.io>',
    );
    expect(senderFor("Ahmad", '"Acme Scheduling" <hello@acme.example>')).toBe(
      '"Ahmad via Acme Scheduling" <hello@acme.example>',
    );
  });
  it("strips characters that could forge a header and falls back when the name is empty", () => {
    expect(senderFor('Eve "<evil@x>"\r\nBcc: a@b', "Bookly <n@b.app>")).toBe(
      '"Eve evil@x Bcc: a@b via Bookly" <n@b.app>',
    );
    expect(senderFor("   ", "Bookly <n@b.app>")).toBe("Bookly <n@b.app>");
  });
});
