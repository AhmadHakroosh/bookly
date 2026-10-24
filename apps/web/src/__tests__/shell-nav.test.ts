import { describe, expect, it } from "vitest";
import { findNav, isActive, navGroups, trail } from "@/components/shell/nav";
import { initialsOf } from "@/components/ui/avatar-stack";

const labels = (o: Parameters<typeof navGroups>[0]) =>
  navGroups(o).map((g) => [g.label, g.items.map((i) => i.label)]);

describe("admin navigation", () => {
  it("groups pages by the job, with Workspace only for owners and admins", () => {
    expect(labels({ tasks: true, files: true, messages: { unread: 2 } })).toEqual([
      ["Work", ["Home", "Bookings", "Contacts", "Messages", "Tasks", "Files"]],
      [
        "Scheduling",
        [
          "Booking page",
          "Event types",
          "Availability",
          "Routing forms",
          "Calendars",
          "Conferencing",
        ],
      ],
    ]);
    expect(labels({ manager: true }).map(([g]) => g)).toEqual(["Work", "Scheduling", "Workspace"]);
    expect(labels({ manager: true, cloud: true }).at(-1)![1]).toContain("Billing");
    expect(labels({ manager: true }).at(-1)![1]).not.toContain("Billing");
  });

  it("shows Hiring only when the flag is on", () => {
    expect(labels({ hiring: true }).map(([g]) => g)).toEqual(["Work", "Hiring", "Scheduling"]);
    expect(labels({}).map(([g]) => g)).not.toContain("Hiring");
  });

  it("keeps collaborators to their own profile and schedule (ADR 0005)", () => {
    const groups = labels({ collaborator: true, manager: true, hiring: true, tasks: true });
    expect(groups).toEqual([
      ["You", ["Profile", "Availability", "Calendars", "Conferencing", "Notifications"]],
    ]);
  });

  it("marks the page a path belongs to, not its neighbours", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin/bookings", "/admin")).toBe(false);
    expect(isActive("/admin/settings/branding", "/admin/settings")).toBe(true);
    expect(isActive("/admin/settingsx", "/admin/settings")).toBe(false);
    expect(findNav(navGroups({ manager: true }), "/admin/team/invite")?.item.label).toBe("Team");
  });
});

describe("breadcrumb", () => {
  it("names the group, the page and its sub-pages", () => {
    expect(trail("/admin", {})).toEqual([
      { label: "Work" },
      { label: "Home", href: "/admin", current: true },
    ]);
    expect(trail("/admin/settings/data/activity", { manager: true }).map((c) => c.label)).toEqual([
      "Workspace",
      "Settings",
      "Data",
      "Activity",
    ]);
    expect(trail("/admin/event-types", {}).at(-1)).toEqual({
      label: "Event types",
      href: "/admin/event-types",
      current: true,
    });
  });

  it("stops at an id and keeps the way back as links", () => {
    const t = trail("/admin/contacts/26df903e-787e-4659-a425-87377f67e65d", {});
    expect(t).toEqual([{ label: "Work" }, { label: "Contacts", href: "/admin/contacts" }]);
  });

  it("names the member's own pages outside the nav", () => {
    expect(trail("/admin/account", {}).map((c) => c.label)).toEqual(["You", "Account"]);
    expect(trail("/admin/notifications", { collaborator: true }).map((c) => c.label)).toEqual([
      "You",
      "Notifications",
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
