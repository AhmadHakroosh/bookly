import { expect, test } from "@playwright/test";

/** Static files are served as-is; anything else that looks like a file is a real 404. */
test("file-like paths", async ({ request }) => {
  const embed = await request.get("/embed.js");
  expect(embed.status()).toBe(200);
  expect(embed.headers()["content-type"]).toContain("javascript");
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Sitemap:");
  for (const path of ["/nothing.txt", "/ai-catalog.json", "/demo.html"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
  }
  // A self-hosted install is not the marketing site: no llms.txt.
  expect((await request.get("/llms.txt")).status()).toBe(404);
});
