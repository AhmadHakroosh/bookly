import { describe, expect, it } from "vitest";
import { formatBytes, GIB, PLANS, storageBudget } from "@bookly/cloud";
import {
  absoluteFileUrl,
  bytesMatchMime,
  checkUpload,
  fileIdFromUrl,
  fileUrl,
  sniffFamily,
} from "@/lib/files";

describe("upload rules", () => {
  it("accepts images for avatars within the cap", () => {
    expect(checkUpload("avatar", "image/png", 1024)).toEqual({ ok: true });
    expect(checkUpload("avatar", "image/JPEG", 1024)).toEqual({ ok: true });
  });
  it("refuses the wrong type, empty files and oversized files", () => {
    expect(checkUpload("avatar", "image/svg+xml", 1024, "logo.svg").ok).toBe(false);
    expect(checkUpload("avatar", "application/pdf", 1024).ok).toBe(false);
    expect(checkUpload("avatar", "image/png", 0).ok).toBe(false);
    expect(checkUpload("avatar", "image/png", 9 * 1024 ** 2).ok).toBe(false);
    expect(checkUpload("attachment", "application/x-msdownload", 10).ok).toBe(false);
  });
  it("lets attachments carry documents up to 50 MB", () => {
    expect(checkUpload("attachment", "application/pdf", 49 * 1024 ** 2)).toEqual({ ok: true });
    expect(checkUpload("attachment", "application/pdf", 51 * 1024 ** 2).ok).toBe(false);
  });
});

describe("file urls", () => {
  it("round-trips the id", () => {
    const id = "6f1c1e0c-6a7b-4b9e-9c5e-0a7a4c1e2d3f";
    expect(fileUrl(id)).toBe(`/files/${id}`);
    expect(fileIdFromUrl(fileUrl(id))).toBe(id);
    expect(fileIdFromUrl("https://cdn.example.com/x.png")).toBeNull();
    expect(fileIdFromUrl("/files/../etc")).toBeNull();
  });
  it("absolutises only relative urls", () => {
    expect(absoluteFileUrl("/files/abc", "https://acme.bookly-app.io")).toBe(
      "https://acme.bookly-app.io/files/abc",
    );
    expect(absoluteFileUrl("https://x.test/a.png", "https://acme.bookly-app.io")).toBe(
      "https://x.test/a.png",
    );
    expect(absoluteFileUrl(null, "https://acme.bookly-app.io")).toBeNull();
  });
});

describe("storage budget", () => {
  it("is flat on Free and Pro, per seat and pooled on Team, unlimited self-hosted", () => {
    expect(storageBudget(PLANS.free, 1)).toBe(1 * GIB);
    expect(storageBudget(PLANS.pro, 1)).toBe(20 * GIB);
    expect(storageBudget(PLANS.team, 3)).toBe(60 * GIB);
    expect(storageBudget(PLANS.team, 1)).toBe(40 * GIB); // two-seat minimum
    expect(formatBytes(20 * GIB)).toBe("20 GB");
    expect(formatBytes(512 * 1024 ** 2)).toBe("512 MB");
  });
});

describe("sniffing", () => {
  const b = (...x: (number | string)[]) =>
    new Uint8Array(
      x.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])),
    );

  it("names what the first bytes are", () => {
    expect(sniffFamily(b("%PDF-1.7\n"))).toBe("pdf");
    expect(sniffFamily(b(0x89, "PNG\r\n"))).toBe("png");
    expect(sniffFamily(b(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffFamily(b("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("webp");
    expect(sniffFamily(b("PK", 3, 4, 20))).toBe("zip");
    expect(sniffFamily(new TextEncoder().encode("name,email\nÅsa,å@x.io\n"))).toBe("text");
    expect(sniffFamily(b(0x4d, 0x5a, 0x90, 0))).toBeNull();
  });

  it("does not call a cut multi-byte character invalid text", () => {
    const text = new TextEncoder().encode("é".repeat(3000)).subarray(0, 4095);
    expect(sniffFamily(text)).toBe("text");
  });

  it("matches only when the bytes are what the type says", () => {
    expect(bytesMatchMime("application/pdf", b("%PDF-1.4"))).toBe(true);
    expect(bytesMatchMime("application/pdf", b("<html>"))).toBe(false);
    expect(
      bytesMatchMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        b("PK", 3, 4),
      ),
    ).toBe(true);
    expect(bytesMatchMime("image/png", b("%PDF-"))).toBe(false);
    expect(bytesMatchMime("application/x-msdownload", b(0x4d, 0x5a))).toBe(false);
  });
});
