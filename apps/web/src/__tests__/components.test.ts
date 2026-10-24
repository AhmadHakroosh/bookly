import { describe, expect, it } from "vitest";
import { kindOf } from "@/components/ui/file-row";
import { CLIENT_JOURNEY } from "@/components/ui/journey-strip";

describe("file type icons", () => {
  it("tells kinds apart by name or MIME type", () => {
    expect(kindOf("proposal.PDF")).toBe("pdf");
    expect(kindOf("application/pdf")).toBe("pdf");
    expect(kindOf("timeline.xlsx")).toBe("sheet");
    expect(kindOf("workshop-notes.docx")).toBe("doc");
    expect(kindOf("image/png")).toBe("image");
    expect(kindOf("client-assets.zip")).toBe("archive");
    expect(kindOf("recording.mp4")).toBe("file");
  });
});

describe("client journey", () => {
  it("is the five steps the concepts promise (D3)", () => {
    expect(CLIENT_JOURNEY).toEqual(["Booked", "Prepared", "Met", "Followed up", "Paid"]);
  });
});
