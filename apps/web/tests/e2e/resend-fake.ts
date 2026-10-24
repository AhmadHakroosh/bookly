import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";

/*
 * Stand-ins for Resend in e2e: the signed reply address Bookly puts on an email, Svix headers
 * for the inbound webhook, and a local server for Resend's received-emails API (the e2e server
 * points RESEND_API_URL at it). Specs run one at a time, so each starts and stops its own.
 */

/** Next to the e2e server's port, as playwright.config.ts computes it: 3999 by default. */
const RESEND_FAKE_PORT = (Number(process.env.E2E_PORT) || 3010) + 989;

const WEBHOOK_SECRET = Buffer.from("e2e-webhook-secret-0123456789");
export const DOMAIN = "reply.bookly.test";
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

/** The address Bookly put on the email logged as entry `id` (same recipe as server/inbound.ts). */
export function replyAddress(id: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set for this test (the server signs with it)");
  const sig = createHmac("sha256", secret).update(`reply:${id}`).digest("hex").slice(0, 16);
  return `r-${id.replace(/-/g, "")}-${sig}@${DOMAIN}`;
}

export function svixHeaders(body: string) {
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${id}.${ts}.${body}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": `v1,${sig}`,
    "content-type": "application/json",
  };
}

/** Resend's received-emails API (on RESEND_FAKE_PORT), answering from `received` (email id → message). */
export async function startFakeResend(received: Map<string, unknown>): Promise<Server> {
  const server = createServer((req, res) => {
    const parts = (req.url ?? "").split("?")[0]!.split("/").filter(Boolean).map(decodeURIComponent);
    // GET /dl/<attachment id>: the bytes behind a download_url.
    if (parts[0] === "dl") {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end(PDF);
    }
    // GET /emails/receiving/<id>/attachments: each attachment with a download_url.
    if (parts.at(-1) === "attachments") {
      const email = received.get(parts.at(-2)!) as { attachments?: { id: string }[] } | undefined;
      res.writeHead(email ? 200 : 404, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          object: "list",
          has_more: false,
          data: (email?.attachments ?? []).map((a) => ({
            ...a,
            download_url: `http://localhost:${RESEND_FAKE_PORT}/dl/${a.id}`,
          })),
        }),
      );
    }
    const email = received.get(parts.at(-1)!);
    res.writeHead(email ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(email ?? { error: "not found" }));
  });
  await new Promise<void>((r) => server.listen(RESEND_FAKE_PORT, r));
  return server;
}
