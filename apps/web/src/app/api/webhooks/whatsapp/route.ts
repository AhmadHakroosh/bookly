import { NextResponse } from "next/server";
import { loadEnv } from "@bookly/config";
import { verifyMetaSignature } from "@/server/texting";

/*
 * Meta (WhatsApp Cloud API) → Bookly. Meta verifies the endpoint once with a GET challenge and
 * then posts delivery statuses and inbound messages. Bookly logs failed deliveries, which is
 * what an operator needs to spot an unapproved template or a number that left WhatsApp;
 * inbound replies are acknowledged and left alone (hosts talk to guests from their own apps).
 */

type Status = { id?: string; status?: string; errors?: { code?: number; title?: string }[] };
type Payload = {
  entry?: { changes?: { value?: { statuses?: Status[]; messages?: unknown[] } }[] }[];
};

/** Meta's strings go into a log line: one line each, no control characters, bounded length. */
const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, 200);

/** Pure: counts statuses and collects failures from a webhook payload (tested without I/O). */
export function summarize(payload: Payload) {
  const statuses: Status[] = [];
  let messages = 0;
  for (const e of payload.entry ?? [])
    for (const c of e.changes ?? []) {
      statuses.push(...(c.value?.statuses ?? []));
      messages += c.value?.messages?.length ?? 0;
    }
  const failed = statuses
    .filter((s) => s.status === "failed")
    .map(
      (s) =>
        `${clean(s.id) || "?"}: ${s.errors?.map((x) => clean(`${x.code} ${x.title}`)).join("; ") || "unknown"}`,
    );

  return { statuses: statuses.length, messages, failed };
}

/** Meta's one-time verification handshake for the configured callback URL. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = loadEnv().WHATSAPP_VERIFY_TOKEN;
  if (
    !token ||
    u.searchParams.get("hub.mode") !== "subscribe" ||
    u.searchParams.get("hub.verify_token") !== token
  )
    return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
}

export async function POST(req: Request) {
  const secret = loadEnv().WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "WHATSAPP_APP_SECRET not set" }, { status: 500 });
  const body = await req.text();
  if (!verifyMetaSignature(secret, body, req.headers.get("x-hub-signature-256")))
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  let payload: Payload;
  try {
    payload = JSON.parse(body) as Payload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const s = summarize(payload);
  // Serialised, so nothing from the request can forge extra log lines.
  for (const f of s.failed) console.error("[whatsapp] delivery failed", JSON.stringify(f));
  return NextResponse.json({ ok: true, ...s });
}
