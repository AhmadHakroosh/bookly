import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { sendDueReminders } from "@/server/reminders";
import { renewCalendarWatches } from "@/server/integrations";
import { retryDueDeliveries } from "@/server/webhooks";

/**
 * Manual / cron fallback for the scheduled jobs (reminders, retries, watches). With QStash
 * configured the same work runs on QStash schedules; this stays for Vercel cron and scripts.
 * Protect with CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let reminders = 0;
  let retried = 0;
  try {
    reminders = await sendDueReminders();
    retried = await retryDueDeliveries();
  } catch (e) {
    Sentry.captureException(e);
    throw e;
  }
  const watches = await renewCalendarWatches().catch((e) => {
    console.error("[calendar] renew failed", e);
    return 0;
  });
  return NextResponse.json({ ok: true, reminders, retried, watches });
}
