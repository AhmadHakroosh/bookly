#!/usr/bin/env node
import { startRealtimeServer } from "./server.ts";

/*
 * The socket server on its own (ADR 0007): for hosts where the app cannot hold sockets (Vercel)
 * or installs that scale sockets apart from the app. `node packages/realtime/src/bin.ts`
 * (Node 24 runs the TypeScript directly). Point the app's REALTIME_URL at it.
 */

const databaseUrl = process.env.REALTIME_DATABASE_URL || process.env.DATABASE_URL;
const authSecret = process.env.AUTH_SECRET;
if (!databaseUrl || !authSecret) {
  console.error("[realtime] DATABASE_URL (or REALTIME_DATABASE_URL) and AUTH_SECRET are required");
  process.exit(1);
}

const server = await startRealtimeServer({
  port: Number(process.env.REALTIME_PORT || process.env.PORT || 3003),
  host: process.env.REALTIME_HOST || "0.0.0.0",
  databaseUrl,
  authSecret,
});
console.log(`[realtime] listening on :${server.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
