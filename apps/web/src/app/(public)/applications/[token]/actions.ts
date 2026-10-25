"use server";

import { z } from "zod";
import { hasFlag } from "@/server/flags";
import {
  ApplyError,
  recoverLinks,
  requestDeletion,
  saveEdit,
  updateAccommodations,
  withdraw,
} from "@/server/hiring/apply";
import { clientIp } from "@/server/request";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * The status page's actions (public): whoever holds the status token is the candidate. The
 * server module checks the token, the application's state and what may change.
 */

async function workspace() {
  const ws = await getCurrentWorkspace();
  if (!ws || !(await hasFlag(ws, "hiring")))
    throw new ApplyError("This page isn't available.", 404);
  return ws;
}

async function run<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApplyError) return { error: e.message };
    throw e;
  }
}

const token = z.string().min(1).max(100);
const text = (max: number) => z.string().max(max);

export async function withdrawAction(raw: string, rawReason: string) {
  // audit: by server/hiring/apply.ts
  const parsed = z.tuple([token, text(1000)]).safeParse([raw, rawReason]);
  if (!parsed.success) return { error: "Reload the page and try again." };
  const [t, reason] = parsed.data;
  return run(async () => {
    await withdraw(await workspace(), t, reason.trim().slice(0, 500) || null);
    return { ok: true as const };
  });
}

export async function deleteRequestAction(raw: string) {
  // audit: by server/hiring/apply.ts
  const parsed = token.safeParse(raw);
  if (!parsed.success) return { error: "Reload the page and try again." };
  return run(async () => {
    await requestDeletion(await workspace(), parsed.data);
    return { ok: true as const };
  });
}

export async function accommodationsAction(raw: string, rawText: string) {
  // audit: by server/hiring/apply.ts
  const parsed = z.tuple([token, text(4000)]).safeParse([raw, rawText]);
  if (!parsed.success) return { error: "Keep it under 4,000 characters." };
  return run(async () => {
    await updateAccommodations(await workspace(), parsed.data[0], parsed.data[1]);
    return { ok: true as const };
  });
}

export async function saveEditAction(
  raw: string,
  draftToken: string | null,
  answers: Record<string, unknown>,
) {
  // audit: by server/hiring/apply.ts
  const parsed = z
    .tuple([token, token.nullable(), z.record(z.string().max(64), z.unknown())])
    .safeParse([raw, draftToken, answers]);
  if (!parsed.success) return { error: "Reload the page and try again." };
  const [t, d, a] = parsed.data;
  return run(async () => saveEdit(await workspace(), t, { draftToken: d, answers: a }));
}

export async function recoverAction(email: string): Promise<{ sent: boolean; limited?: boolean }> {
  // audit: read-only — emails fresh status links; the old ones stop working, nothing else changes
  const ws = await workspace();
  const r = await recoverLinks(
    ws,
    typeof email === "string" ? email.slice(0, 320) : "",
    await clientIp(),
  );
  return r === "limited" ? { sent: false, limited: true } : { sent: true };
}
