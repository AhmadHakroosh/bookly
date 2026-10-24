import { describe, expect, it } from "vitest";
import { ACTIONS, AccessError, assertCan, can } from "@/server/access/can";
import { BILLABLE_ROLES, isCollaborator, WORKSPACE_ROLES } from "@/lib/roles";

describe("workspace roles", () => {
  it("owners and admins may do everything", () => {
    for (const role of ["owner", "admin"])
      for (const a of ACTIONS) expect(can({ workspaceRole: role }, a)).toBe(true);
  });

  it("members work with clients and their own schedule, not the workspace", () => {
    const m = { workspaceRole: "member" };
    expect(can(m, "client_work.read")).toBe(true);
    expect(can(m, "own_schedule.manage")).toBe(true);
    expect(can(m, "opportunity.create")).toBe(true);
    expect(can(m, "workspace.manage")).toBe(false);
  });

  it("collaborators only manage their own schedule", () => {
    const c = { workspaceRole: "collaborator" };
    expect(ACTIONS.filter((a) => can(c, a))).toEqual(["own_schedule.manage"]);
    expect(() => assertCan(c, "client_work.read")).toThrow(AccessError);
    expect(isCollaborator("collaborator")).toBe(true);
  });

  it("refuses unknown or missing roles", () => {
    for (const a of ACTIONS) {
      expect(can({ workspaceRole: null }, a)).toBe(false);
      expect(can({ workspaceRole: "guest" }, a)).toBe(false);
    }
  });

  it("bills owners, admins and members, never collaborators", () => {
    expect(WORKSPACE_ROLES.filter((r) => BILLABLE_ROLES.includes(r))).toEqual([
      "owner",
      "admin",
      "member",
    ]);
  });
});
