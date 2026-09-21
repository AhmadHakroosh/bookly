/* Seeds a demo tenant for local development: pnpm demo */
import { config } from "dotenv";
import Module from "node:module";
import path from "node:path";

config({ path: ["../../.env.local", "../../.env", ".env"] });

// Server modules import "server-only", which throws outside Next. Point it at the test stub.
const mod = Module as unknown as { _resolveFilename: (...a: unknown[]) => string };
const original = mod._resolveFilename;
mod._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return path.resolve("src/__tests__/__mocks__/server-only.ts");
  return original.call(this, request, ...rest);
};

const main = async () => {
  const { seedDemo } = await import("../src/server/demo");
  console.log(await seedDemo());
  process.exit(0);
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
