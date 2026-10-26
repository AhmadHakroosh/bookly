import { describe, expect, it } from "vitest";
import { filtersFromParams, paramsFromFilters } from "@/lib/tasks-view";
import { cardOf } from "@/lib/task-card";
import {
  between,
  cleanFilters,
  decodeCommentCursor,
  encodeCommentCursor,
  cleanStatus,
  decodeColumnCursor,
  decodeListCursor,
  encodeColumnCursor,
  encodeListCursor,
  parseMentions,
  pickStatuses,
  statusSetProblem,
} from "@/server/tasks";

const status = (o: Partial<{ id: string; name: string; isDone: boolean; isDefault: boolean }>) =>
  ({
    id: o.id ?? o.name ?? "s",
    name: o.name ?? "S",
    isDone: !!o.isDone,
    isDefault: !!o.isDefault,
  }) as never;

describe("board positions", () => {
  it("places a card between, before, after, or alone", () => {
    expect(between(1024, 2048)).toBe(1536);
    expect(between(null, 2048)).toBe(1024);
    expect(between(1024, null)).toBe(2048);
    expect(between(null, null)).toBe(1024);
  });
  it("asks for a renumber when the neighbours are too close", () => {
    expect(between(1, 1 + 1e-9)).toBeNull();
    expect(between(5, 5)).toBeNull();
  });
});

describe("status sets", () => {
  const base = [
    { name: "To do", isDone: false, isDefault: true },
    { name: "Doing", isDone: false, isDefault: false },
    { name: "Done", isDone: true, isDefault: false },
  ];
  it("accepts the default flow", () => expect(statusSetProblem(base)).toBeNull());
  it("needs an open and a done column", () => {
    expect(statusSetProblem(base.map((s) => ({ ...s, isDone: false })))).toMatch(/done status/);
    expect(statusSetProblem([{ name: "Done", isDone: true, isDefault: true }])).toMatch(/not done/);
  });
  it("needs exactly one open default and unique names", () => {
    expect(statusSetProblem(base.map((s) => ({ ...s, isDefault: false })))).toMatch(/Exactly one/);
    expect(statusSetProblem(base.map((s) => ({ ...s, isDefault: s.name === "Done" })))).toMatch(
      /cannot be a done/,
    );
    expect(statusSetProblem([...base, { name: "done", isDone: true, isDefault: false }])).toMatch(
      /same name/,
    );
  });
  it("cleans names, colours and WIP limits", () => {
    expect(cleanStatus({ name: "  " })).toMatch(/needs a name/);
    expect(cleanStatus({ color: "red" })).toMatch(/color/);
    expect(cleanStatus({ name: " Waiting ", color: "#AABBCC", wipLimit: 0 })).toEqual({
      name: "Waiting",
      color: "#aabbcc",
      wipLimit: null,
    });
  });
  it("picks the default open status and the first done one", () => {
    const set = [
      status({ name: "Inbox" }),
      status({ name: "Today", isDefault: true }),
      status({ name: "Shipped", isDone: true }),
      status({ name: "Dropped", isDone: true }),
    ];
    const p = pickStatuses(set);
    expect([(p.initial as { name: string }).name, (p.done as { name: string }).name]).toEqual([
      "Today",
      "Shipped",
    ]);
  });
});

describe("cursors and filters", () => {
  it("round-trips the column and list cursors", () => {
    expect(decodeColumnCursor(encodeColumnCursor({ position: 1536.5, id: "t1" }))).toEqual({
      position: 1536.5,
      id: "t1",
    });
    const t = { dueAt: null, createdAt: new Date("2026-10-16T10:00:00Z"), id: "t2" };
    expect(decodeListCursor(encodeListCursor(t))).toEqual({
      due: "9999-12-31T00:00:00.000Z",
      createdAt: "2026-10-16T10:00:00.000Z",
      id: "t2",
    });
    const c = { createdAt: new Date("2026-10-16T09:00:00Z"), id: "c1" };
    expect(decodeCommentCursor(encodeCommentCursor(c))).toEqual({
      createdAt: "2026-10-16T09:00:00.000Z",
      id: "c1",
    });
    expect(decodeColumnCursor("junk")).toBeNull();
    expect(decodeListCursor("")).toBeNull();
  });
  it("keeps filters in the URL and back", () => {
    const f = { assignee: "me", due: "overdue" as const, statusIds: ["a", "b"], showDone: true };
    const q = paramsFromFilters(f);
    expect(q).toEqual({ assignee: "me", due: "overdue", status: "a,b", done: "1" });
    expect(filtersFromParams(q)).toEqual(f);
    expect(filtersFromParams({})).toBeNull();
    expect(filtersFromParams({ due: "someday" })).toBeNull();
  });
  it("drops unknown filter fields from saved views", () => {
    expect(cleanFilters({ due: "week", sql: "drop", statusIds: ["x", 3] })).toEqual({
      due: "week",
      statusIds: ["x"],
    });
  });
});

describe("mentions and cards", () => {
  const people = [
    { userId: "u1", displayName: "Ann" },
    { userId: "u2", displayName: "Ann Lee" },
    { userId: "u3", displayName: "Omar" },
  ];
  it("finds @-mentioned members by display name, longest name first", () => {
    expect(parseMentions("Thanks @Ann Lee, can you check?", people)).toEqual(["u2"]);
    expect(parseMentions("@omar and @Ann: ship it.", people).sort()).toEqual(["u1", "u3"]);
    expect(parseMentions("email ann@example.com", people)).toEqual([]);
  });
  it("marks overdue only for open tasks with a past due date", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    const base = {
      id: "t",
      title: "T",
      userId: "u1",
      contactName: null,
      bookingTitle: null,
      comments: 0,
      dueAt: new Date("2026-10-15T00:00:00Z"),
    };
    expect(cardOf({ ...base, doneAt: null }, "UTC", { u1: "Ann" }, now)).toMatchObject({
      overdue: true,
      assignee: "Ann",
      done: false,
    });
    expect(cardOf({ ...base, doneAt: new Date() }, "UTC", {}, now).overdue).toBe(false);
  });
});
