import { describe, expect, it, vi } from "vitest";
import { memoryLimiter, upstashLimiter } from "@/server/ratelimit";

describe("memoryLimiter", () => {
  it("counts within a window and expires KV entries", async () => {
    const l = memoryLimiter();
    expect((await l.hit("a", 2, 1000)).ok).toBe(true);
    expect((await l.hit("a", 2, 1000)).ok).toBe(true);
    expect((await l.hit("a", 2, 1000)).ok).toBe(false);
    await l.set("k", "v", 1);
    expect(await l.get("k")).toBe("v");
    await l.del("k");
    expect(await l.get("k")).toBeNull();
    expect(await l.incr("c", 60)).toBe(1);
    expect(await l.incr("c", 60)).toBe(2);
    await l.set("g", "once");
    expect(await l.getDel("g")).toBe("once");
    expect(await l.get("g")).toBeNull();
  });
});

describe("upstashLimiter", () => {
  it("sends INCR/PEXPIRE/PTTL as one pipeline and reads the count back", async () => {
    let count = 0;
    const calls: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const cmds = JSON.parse(String(init?.body)) as (string | number)[][];
      calls.push(cmds);
      const results = cmds.map((c) => {
        if (c[0] === "INCR") return { result: ++count };
        if (c[0] === "PEXPIRE") return { result: 1 };
        if (c[0] === "PTTL") return { result: 500 };
        if (c[0] === "PING") return { result: "PONG" };
        if (c[0] === "GET") return { result: "stored" };
        return { result: "OK" };
      });
      return new Response(JSON.stringify(results), { status: 200 });
    });
    const l = upstashLimiter("https://example.upstash.io/", "tok", fetchImpl as typeof fetch);
    expect((await l.hit("x", 2, 60_000)).ok).toBe(true);
    expect((await l.hit("x", 2, 60_000)).ok).toBe(true);
    const third = await l.hit("x", 2, 60_000);
    expect(third.ok).toBe(false);
    expect(third.remaining).toBe(0);
    expect(calls[0]).toEqual([
      ["INCR", "bookly:rl:x"],
      ["PEXPIRE", "bookly:rl:x", 60_000, "NX"],
      ["PTTL", "bookly:rl:x"],
    ]);
    expect(await l.ping()).toBe(true);
    expect(await l.get("k")).toBe("stored");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://example.upstash.io/pipeline");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("reports a store failure instead of throwing from ping", async () => {
    const l = upstashLimiter(
      "https://x",
      "t",
      (async () => new Response("nope", { status: 500 })) as typeof fetch,
    );
    expect(await l.ping()).toBe(false);
    await expect(l.hit("x", 1, 1000)).rejects.toThrow("upstash 500");
  });
});
