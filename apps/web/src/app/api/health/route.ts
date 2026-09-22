import { NextResponse } from "next/server";
import { connection } from "next/server";
import { sql } from "@bookly/db";
import { db } from "@/lib/db";

/** Uptime check: 200 when the app can reach Postgres, 503 otherwise. No auth, no details. */
export async function GET() {
  await connection();
  try {
    await db().execute(sql`select 1`);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
