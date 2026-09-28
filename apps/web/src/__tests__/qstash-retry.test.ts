import { describe, expect, it } from "vitest";
import { publish } from "@bookly/jobs";

const ok = () => new Response(JSON.stringify({ messageId: "msg_1" }), { status: 200 });
const timeout = () => Object.assign(new Error("aborted"), { name: "TimeoutError" });

describe("qstash publish", () => {
  it("retries once when the request times out", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) throw timeout();
      return ok();
    }) as unknown as typeof fetch;
    const r = await publish(
      { url: "https://q.test", token: "t", fetchImpl },
      "https://a.test/j",
      {},
    );
    expect(r.messageId).toBe("msg_1");
    expect(calls).toBe(2);
  });

  it("gives up after the second timeout and does not retry other errors", async () => {
    let calls = 0;
    const always = (async () => {
      calls++;
      throw timeout();
    }) as unknown as typeof fetch;
    await expect(
      publish({ url: "https://q.test", token: "t", fetchImpl: always }, "https://a.test/j", {}),
    ).rejects.toThrow();
    expect(calls).toBe(2);
    let other = 0;
    const network = (async () => {
      other++;
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(
      publish({ url: "https://q.test", token: "t", fetchImpl: network }, "https://a.test/j", {}),
    ).rejects.toThrow("fetch failed");
    expect(other).toBe(1);
  });
});
