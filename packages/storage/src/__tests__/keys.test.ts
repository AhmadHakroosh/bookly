import { describe, expect, it } from "vitest";
import { safeKey } from "../index";

describe("storage keys", () => {
  it("normalises leading slashes and dot segments", () => {
    expect(safeKey("/ws/a/avatar/x.png")).toBe("ws/a/avatar/x.png");
    expect(safeKey("ws/a/../b/x.png")).toBe("ws/b/x.png");
  });
  it("refuses anything that could leave the root", () => {
    expect(() => safeKey("../x")).toThrow();
    expect(() => safeKey("..")).toThrow();
    expect(() => safeKey("")).toThrow();
    expect(() => safeKey("/")).toThrow();
  });
});
