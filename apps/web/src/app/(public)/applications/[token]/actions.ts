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

export async function withdrawAction(token: string, reason: string) {
  // audit: by server/hiring/apply.ts
  return run(async () => {
    await withdraw(await workspace(), token, reason.trim().slice(0, 500) || null);
    return { ok: true as const };
  });
}

export async function deleteRequestAction(token: string) {
  // audit: by server/hiring/apply.ts
  return run(async () => {
    await requestDeletion(await workspace(), token);
    return { ok: true as const };
  });
}

export async function accommodationsAction(token: string, text: string) {
  // audit: by server/hiring/apply.ts
  return run(async () => {
    await updateAccommodations(await workspace(), token, text);
    return { ok: true as const };
  });
}

export async function saveEditAction(
  token: string,
  draftToken: string | null,
  answers: Record<string, unknown>,
) {
  // audit: by server/hiring/apply.ts
  const parsed = z.record(z.string().max(64), z.unknown()).safeParse(answers);
  if (!parsed.success) return { error: "Reload the page and try again." };
  return run(async () => saveEdit(await workspace(), token, { draftToken, answers: parsed.data }));
}

export async function recoverAction(email: string): Promise<{ sent: boolean; limited?: boolean }> {
  // audit: read-only — emails fresh status links; the old ones stop working, nothing else changes
  const ws = await workspace();
  const r = await recoverLinks(ws, String(email).slice(0, 320), await clientIp());
  return r === "limited" ? { sent: false, limited: true } : { sent: true };
}
