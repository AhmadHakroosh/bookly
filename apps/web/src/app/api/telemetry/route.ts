import { NextResponse } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { isCloud } from "@/server/platform";
import { APP_VERSION, recordInstall } from "@/server/telemetry";

const pingSchema = z.object({
  installId: z.uuid(),
  version: z.string().max(32),
  tenancy: z.enum(["single", "multi"]),
  nodeVersion: z.string().max(32),
  stats: z
    .object({
      workspaces: z.number().int().nonnegative(),
      hosts: z.number().int().nonnegative(),
      eventTypes: z.number().int().nonnegative(),
      bookings30d: z.number().int().nonnegative(),
      contacts: z.number().int().nonnegative(),
      integrations: z.array(z.string().max(32)).max(20),
      captureEnabled: z.boolean(),
      paymentsEnabled: z.boolean(),
    })
    .optional(),
});

const reply = () =>
  NextResponse.json(
    { latest: APP_VERSION, url: "https://github.com/AhmadHakroosh/bookly/releases" },
    { headers: { "Cache-Control": "no-store" } },
  );

/** Latest version, for anyone who wants to check by hand. */
export async function GET() {
  await connection();
  return reply();
}

/** Receives the daily update check from self-hosted installs (platform host only). */
export async function POST(request: Request) {
  await connection();
  if (!isCloud()) return NextResponse.json({ error: "Not a platform host" }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = pingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid ping" }, { status: 400 });
  await recordInstall(parsed.data);
  return reply();
}
