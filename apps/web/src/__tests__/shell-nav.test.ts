import { describe, expect, it } from "vitest";
import {
  findNav,
  isActive,
  navPages,
  navSections,
  solutionOf,
  trail,
} from "@/components/shell/nav";
import { initialsOf } from "@/components/ui/avatar-stack";

const sidebar = (...a: Parameters<typeof navSections>) =>
  navSections(...a).map((s) => [s.id, s.items.map((i) => i.label)]);

describe("admin sidebar (concept fidelity §2)", () => {
  it("draws app ui.png: primary items, scheduling items, Settings and Team at the bottom", () => {
    expect(sidebar({ manager: true, tasks: true, files: true, messages: { unread: 2 } })).toEqual([
      ["primary", ["Home", "Bookings", "Contacts", "Messages", "Tasks", "Files"]],
      // Routing is Availability & routing's tab (mocks.png 03), not an item of its own.
      ["scheduling", ["Booking page", "Event types", "Availability"]],
      ["bottom", ["Settings", "Team"]],
    ]);
    // Members do not manage the workspace: nothing pinned at the bottom.
    expect(sidebar({}).at(-1)).toEqual(["bottom", []]);
  });

  it("swaps in Hiring's own items only where the flag is on", () => {
    expect(sidebar({ hiring: true, manager: true, files: true }, "hiring")).toEqual([
      ["primary", ["Overview", "Opportunities", "Candidates", "Interviews", "Reviews", "Files"]],
      ["bottom", ["Settings", "Team"]],
    ]);
    // The reviews the member owes ride on Reviews.
    const reviews = navSections({ hiring: true, reviewsOwed: 3 }, "hiring")[0]!.items.find(
      (i) => i.label === "Reviews",
    );
    expect(reviews?.count).toBe(3);
    expect(sidebar({ manager: true }, "hiring")[0]![1]).toContain("Home");
  });

  it("keeps collaborators to their own profile and schedule (ADR 0005)", () => {
    expect(sidebar({ collaborator: true, manager: true, hiring: true }, "hiring")).toEqual([
      ["primary", ["Profile", "Availability", "Calendars & conferencing", "Notifications"]],
    ]);
  });

  it("tells hiring pages from client pages, and leaves shared pages to the side you were on", () => {
    expect(solutionOf("/admin/hiring")).toBe("hiring");
    expect(solutionOf("/admin/bookings")).toBe("clients");
    expect(solutionOf("/admin/messages")).toBeNull();
    expect(solutionOf("/admin/settings/branding")).toBeNull();
  });

  it("finds every page for ⌘K, the ones off the sidebar included", () => {
    const hrefs = navPages({ manager: true, cloud: true, hiring: true }).map((p) => p.item.href);
    for (const h of [
      "/admin/calendars",
      "/admin/routing",
      "/admin/domains",
      "/admin/billing",
      "/admin/hiring",
      "/admin/hiring/reviews",
    ])
      expect(hrefs).toContain(h);
    expect(navPages({}).map((p) => p.item.href)).not.toContain("/admin/domains");
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("marks the page a path belongs to, not its neighbours", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin/bookings", "/admin")).toBe(false);
    expect(isActive("/admin/settings/branding", "/admin/settings")).toBe(true);
    expect(isActive("/admin/settingsx", "/admin/settings")).toBe(false);
    expect(findNav({ manager: true }, "/admin/team/invite")?.item.label).toBe("Team");
  });
});

describe("breadcrumb", () => {
  it("starts at Workspace, as the concept writes it", () => {
    expect(trail("/admin", {})).toEqual([
      { label: "Workspace", href: "/admin" },
      { label: "Home", href: "/admin", current: true },
    ]);
    expect(trail("/admin/settings/data/activity", { manager: true }).map((c) => c.label)).toEqual([
      "Workspace",
      "Settings",
      "Privacy",
      "Activity",
    ]);
    expect(trail("/admin/settings/api", { manager: true }).at(-1)?.label).toBe("API");
  });

  it("marks only Opportunities active below it, not Hiring's Overview", () => {
    expect(isActive("/admin/hiring/opportunities/x", "/admin/hiring")).toBe(false);
    expect(isActive("/admin/hiring/opportunities/x", "/admin/hiring/opportunities")).toBe(true);
    expect(isActive("/admin/hiring", "/admin/hiring")).toBe(true);
  });

  it("starts at Hiring on hiring pages", () => {
    expect(trail("/admin/hiring", { hiring: true }).map((c) => c.label)).toEqual([
      "Hiring",
      "Overview",
    ]);
  });

  it("stops at an id and keeps the way back as links", () => {
    expect(trail("/admin/contacts/26df903e-787e-4659-a425-87377f67e65d", {})).toEqual([
      { label: "Workspace", href: "/admin" },
      { label: "Contacts", href: "/admin/contacts" },
    ]);
  });

  it("names the member's own pages outside the sidebar", () => {
    expect(trail("/admin/account", {}).map((c) => c.label)).toEqual(["Workspace", "Account"]);
    expect(trail("/admin/calendars", {}).map((c) => c.label)).toEqual([
      "Workspace",
      "Calendars & conferencing",
    ]);
  });
});

describe("initials", () => {
  it("takes the first and last word, or the address before the @", () => {
    expect(initialsOf("Maya Chen")).toBe("MC");
    expect(initialsOf("Ana María de la Cruz")).toBe("AC");
    expect(initialsOf("jordan@example.com")).toBe("J");
    expect(initialsOf("  ")).toBe("?");
  });
});
