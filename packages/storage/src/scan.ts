import { connect } from "node:net";
import { loadEnv } from "@bookly/config";

/*
 * The malware scan hook (ADR 0004): every public upload is scanned before anyone opens it. With
 * no scanner configured a file stays `pending`, and pending files are only ever served as a
 * download, never shown in the browser. Self-hosters can run ClamAV (`docker compose --profile
 * scan`, then CLAMAV_HOST=clamav); the cloud plugs its own scanner in with `setScanner`.
 */

export type ScanResult = "clean" | "infected" | "pending";
export type Scanner = (file: {
  bytes: Uint8Array;
  name: string;
  mime: string;
}) => Promise<ScanResult>;

let custom: Scanner | null = null;

/** Replaces the scanner (the hosted one, or a fake in tests); null goes back to the default. */
export function setScanner(s: Scanner | null) {
  custom = s;
}

/** Scans one file. A scanner that fails or times out leaves the file `pending`, never `clean`. */
export async function scanFile(file: {
  bytes: Uint8Array;
  name: string;
  mime: string;
}): Promise<ScanResult> {
  const scanner = custom ?? defaultScanner();
  if (!scanner) return "pending";
  try {
    return await scanner(file);
  } catch (e) {
    console.error("[scan] scanner failed", e);
    return "pending";
  }
}

function defaultScanner(): Scanner | null {
  const env = loadEnv();
  return env.CLAMAV_HOST ? clamavScanner(env.CLAMAV_HOST, env.CLAMAV_PORT) : null;
}

/** clamd's INSTREAM: length-prefixed chunks, a zero-length chunk to end, one line back. */
export function clamavScanner(host: string, port: number, timeoutMs = 30_000): Scanner {
  return ({ bytes }) =>
    new Promise<ScanResult>((resolve, reject) => {
      const socket = connect({ host, port });
      let reply = "";
      const fail = (e: Error) => {
        socket.destroy();
        reject(e);
      };
      socket.setTimeout(timeoutMs, () => fail(new Error("ClamAV timed out")));
      socket.on("error", fail);
      socket.on("data", (d) => (reply += d.toString("utf8")));
      socket.on("end", () => resolve(parseClamReply(reply)));
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let i = 0; i < bytes.length; i += 64 * 1024) {
          const chunk = bytes.subarray(i, i + 64 * 1024);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    });
}

/** "stream: OK" → clean; "stream: <signature> FOUND" → infected; anything else is an error. */
export function parseClamReply(reply: string): ScanResult {
  const line = reply.replace(/\0/g, "").trim();
  if (/: OK$/.test(line)) return "clean";
  if (/ FOUND$/.test(line)) return "infected";
  throw new Error(`ClamAV: ${line || "no reply"}`);
}
