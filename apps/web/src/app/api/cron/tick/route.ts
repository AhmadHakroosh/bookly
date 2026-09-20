import { NextResponse } from "next/server";
import { sendDueReminders } from "@/server/reminders";
import { retryDueDeliveries } from "@/server/webhooks";

/** Serverless alternative to the pg-boss worker: reminders + housekeeping. Protect with CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const reminders = await sendDueReminders();
  const retried = await retryDueDeliveries();
  return NextResponse.json({ ok: true, reminders, retried });
}
