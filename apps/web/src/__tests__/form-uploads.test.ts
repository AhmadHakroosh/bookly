import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { maxBytesFor, uploadProblem } = await import("@/server/form-uploads");

const MB = 1024 ** 2;
const cv = {
  label: "CV",
  file: { accept: ["application/pdf"], maxMb: 25, maxFiles: 2 },
};

describe("file questions on public forms", () => {
  it("caps every public upload at 10 MB, whatever the question allows", () => {
    expect(maxBytesFor(cv)).toBe(10 * MB);
    expect(maxBytesFor({ file: { accept: [], maxMb: 2, maxFiles: 1 } })).toBe(2 * MB);
    expect(uploadProblem(cv, { mime: "application/pdf", size: 11 * MB }, 0)).toBe(
      "Files can be up to 10 MB.",
    );
  });

  it("takes only the question's types, and only types the app allows at all", () => {
    expect(uploadProblem(cv, { mime: "application/pdf", size: MB }, 0)).toBeNull();
    expect(uploadProblem(cv, { mime: "image/png", size: MB }, 0)).toBe(
      "That type of file is not accepted here.",
    );
    const any = { label: "Anything", file: { accept: [], maxMb: 10, maxFiles: 1 } };
    expect(uploadProblem(any, { mime: "text/html", size: MB }, 0)).toBe(
      "That type of file is not accepted here.",
    );
  });

  it("counts the files already sent to the question", () => {
    expect(uploadProblem(cv, { mime: "application/pdf", size: MB }, 2)).toBe("Up to 2 files.");
    expect(
      uploadProblem(
        { ...cv, file: { ...cv.file, maxFiles: 1 } },
        { mime: "application/pdf", size: MB },
        1,
      ),
    ).toBe("Remove the file first to send another.");
    expect(uploadProblem(cv, { mime: "application/pdf", size: 0 }, 0)).toBe("The file is empty.");
  });
});
