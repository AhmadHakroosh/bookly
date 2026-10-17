import { describe, expect, it } from "vitest";
import { paneTarget } from "@/lib/pane-url";

const at = (u: string) => new URL(u, "https://acme.bookly-app.io");

describe("pane links", () => {
  it("opens a pane when only its parameter is added or changed", () => {
    expect(paneTarget("/admin/messages?thread=t1", at("/admin/messages"))).toBe(true);
    expect(
      paneTarget("/admin/messages?box=team&thread=t2", at("/admin/messages?box=team&thread=t1")),
    ).toBe(true);
    // Parameter order does not matter; paging inside the old pane is dropped.
    expect(
      paneTarget("/admin/tasks?task=a&view=all", at("/admin/tasks?view=all&task=b&before=xyz")),
    ).toBe(true);
    expect(
      paneTarget(
        "https://acme.bookly-app.io/admin/files?view=recent&file=f",
        at("/admin/files?view=recent"),
      ),
    ).toBe(true);
  });

  it("leaves real navigations alone", () => {
    // Another page, another filter, the same pane again, closing, another site.
    expect(paneTarget("/admin/tasks?task=a", at("/admin/messages"))).toBe(false);
    expect(paneTarget("/admin/messages?box=team&thread=t1", at("/admin/messages"))).toBe(false);
    expect(paneTarget("/admin/messages?thread=t1", at("/admin/messages?thread=t1"))).toBe(false);
    expect(paneTarget("/admin/messages", at("/admin/messages?thread=t1"))).toBe(false);
    expect(paneTarget("https://example.com/admin/messages?thread=t1", at("/admin/messages"))).toBe(
      false,
    );
    // Paging inside a pane (earlier comments) is a navigation, not a new pane.
    expect(paneTarget("/admin/tasks?task=a&before=c", at("/admin/tasks?task=a"))).toBe(false);
  });
});
