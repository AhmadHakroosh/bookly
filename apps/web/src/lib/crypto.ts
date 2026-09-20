import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { loadEnv } from "@bookly/config";

/** 256-bit key derived from AUTH_SECRET; used for OAuth tokens at rest. */
function key() {
  return createHash("sha256").update(`bookly-tokens:${loadEnv().AUTH_SECRET}`).digest();
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !enc) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Signed, expiring opaque state for OAuth round trips. */
export function signState(data: Record<string, string>, ttlSec = 600): string {
  const body = Buffer.from(
    JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSec }),
  ).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): Record<string, string> | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqualStr(expected, sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<
      string,
      string | number
    >;
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    const { exp: _exp, ...rest } = data;
    void _exp;
    return rest as Record<string, string>;
  } catch {
    return null;
  }
}

function timingSafeEqualStr(a: string, b: string) {
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
