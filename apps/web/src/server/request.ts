import "server-only";
import { headers } from "next/headers";
import { PUBLIC_FORM_LIMIT } from "./abuse";
import { rateLimit } from "./api";

/** Best-effort client IP behind a proxy / Vercel. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Throttles a public form (booking, waitlist, routing) per workspace and IP: a handful of
 * submissions per ten minutes is plenty for a person and stops scripted floods.
 */
export async function throttlePublicForm(workspaceId: string, what: string): Promise<boolean> {
  const ip = await clientIp();
  return rateLimit(
    `${what}:${workspaceId}:${ip}`,
    PUBLIC_FORM_LIMIT.max,
    PUBLIC_FORM_LIMIT.windowMs,
  ).ok;
}
