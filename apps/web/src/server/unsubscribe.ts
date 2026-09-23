import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@bookly/config";
import { baseUrl } from "./scheduling";

const sign = (contactId: string) =>
  createHmac("sha256", loadEnv().AUTH_SECRET)
    .update(`unsubscribe:${contactId}`)
    .digest("base64url");

/** Signed, non-expiring token that identifies a contact in an unsubscribe link. */
export function unsubscribeToken(contactId: string) {
  return `${contactId}.${sign(contactId)}`;
}

/** The contact id inside a token, or null when the signature does not match. */
export function readUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(id));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** Link for the email footer (a page with a button). */
export const unsubscribeUrl = (contactId: string) =>
  `${baseUrl()}/unsubscribe/${unsubscribeToken(contactId)}`;

/** Target of the List-Unsubscribe header: answers one-click (RFC 8058) POSTs. */
export const unsubscribePostUrl = (contactId: string) =>
  `${baseUrl()}/api/unsubscribe/${unsubscribeToken(contactId)}`;
