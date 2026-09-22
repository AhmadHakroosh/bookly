import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { connection } from "next/server";
import { loadEnv } from "@bookly/config";
import { verifyQstashSignature } from "@bookly/jobs";
import { isJobName, runJob } from "@/server/jobs";

/** Long enough for a transcript download plus a recap. */
export const maxDuration = 300;

/**
 * Job endpoint for QStash (signed with the signing keys) or a manual caller with CRON_SECRET.
 * Non-2xx makes QStash retry, so handler errors are surfaced, not swallowed.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/jobs/[name]">) {
  await connection();
  const { name } = await params;
  if (!isJobName(name)) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  const body = await req.text();
  const env = loadEnv();
  const secret = process.env.CRON_SECRET;
  const manual = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!manual) {
    if (!env.QSTASH_CURRENT_SIGNING_KEY)
      return NextResponse.json({ error: "QStash signing key not set" }, { status: 401 });
    const v = verifyQstashSignature(req.headers.get("upstash-signature"), body, {
      current: env.QSTASH_CURRENT_SIGNING_KEY,
      next: env.QSTASH_NEXT_SIGNING_KEY,
    });
    if (!v.ok) return NextResponse.json({ error: `Bad signature: ${v.reason}` }, { status: 401 });
  }
  let data: unknown = {};
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const started = Date.now();
  try {
    await runJob(name, data as never);
  } catch (e) {
    Sentry.captureException(e);
    console.error(`[jobs] ${name} failed`, e);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, job: name, ms: Date.now() - started });
}
