import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.APP_URL ??= "http://localhost:3002";

const drive = await import("@/server/drive");

describe("drive helpers", () => {
  it("serves only the upload allow-list as is; anything else downloads", () => {
    expect(drive.safeMime("application/pdf")).toBe("application/pdf");
    expect(drive.safeMime("IMAGE/PNG; charset=binary")).toBe("image/png");
    expect(drive.safeMime("text/html")).toBe("application/octet-stream");
    expect(drive.safeMime("image/svg+xml")).toBe("application/octet-stream");
    expect(drive.safeMime(null)).toBe("application/octet-stream");
    expect(drive.PREVIEWABLE.has("image/svg+xml")).toBe(false);
  });

  it("views images and PDFs only, by stored type or else by extension", async () => {
    const { previewKind } = await import("@/lib/preview");
    expect(previewKind({ name: "scan.bin", mime: "application/pdf" })).toBe("pdf");
    expect(previewKind({ name: "a_resume.pdf" })).toBe("pdf");
    expect(previewKind({ name: "Photo.JPG", mime: null })).toBe("image");
    expect(previewKind({ name: "logo.svg" })).toBeNull();
    expect(previewKind({ name: "notes.docx", mime: "application/octet-stream" })).toBeNull();
    // The stored type wins over a misleading name.
    expect(previewKind({ name: "x.png", mime: "text/html" })).toBeNull();
  });

  it("reads attachments off an entry's data, without a type until it is looked up", async () => {
    const { attachmentsOf } = await import("@/server/timeline");
    expect(attachmentsOf({ attachments: [{ filename: "a.pdf", fileId: "f1" }, {}] })).toEqual([
      { filename: "a.pdf", fileId: "f1", reason: null, mime: null },
      { filename: "attachment", fileId: null, reason: null, mime: null },
    ]);
    expect(attachmentsOf({})).toEqual([]);
    expect(attachmentsOf(null)).toEqual([]);
  });

  it("cleans names: no slashes, control characters or runs of spaces", () => {
    expect(drive.cleanName("  ../etc/passwd  ")).toBe(".. etc passwd");
    expect(drive.cleanName("a\u0000b\nc")).toBe("a b c");
    expect(drive.cleanName("x".repeat(300))).toHaveLength(200);
  });

  it("round-trips the name cursor, including names with odd characters", () => {
    const f = { name: "Contract | v2 (final).pdf", id: "3f2c8a10-5b6d-4e7f-8a9b-0c1d2e3f4a5b" };
    expect(drive.decodeFileCursor(drive.encodeFileCursor(f))).toEqual(f);
    expect(drive.decodeFileCursor("")).toBeNull();
  });

  it("signed links open until they expire and only for their file", () => {
    const url = drive.signedFileLink("file-1", 7, "https://acme.example.com");
    expect(url.startsWith("https://acme.example.com/files/file-1?t=")).toBe(true);
    const token = new URL(url).searchParams.get("t");
    expect(drive.readFileToken("file-1", token)).toBe(true);
    expect(drive.readFileToken("file-2", token)).toBe(false);
    expect(drive.readFileToken("file-1", token, Date.now() + 8 * 86_400_000)).toBe(false);
    expect(drive.readFileToken("file-1", "123.abc")).toBe(false);
    expect(drive.readFileToken("file-1", null)).toBe(false);
  });

  it("lists linked files in the email text only when there are any", () => {
    expect(drive.linksText([])).toBe("");
    expect(drive.linksText([{ name: "big.zip", url: "https://x/files/1?t=1.a" }])).toContain(
      "- big.zip: https://x/files/1?t=1.a",
    );
  });
});
