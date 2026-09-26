"use server";

import { z } from "zod";
import { rememberConsent } from "./consent";

/** Called right before a social sign-up leaves for the provider: records which legal revision was accepted. */
export async function rememberConsentAction(version: string): Promise<{ ok: boolean }> {
  const parsed = z.string().trim().min(1).max(40).safeParse(version);
  if (!parsed.success) return { ok: false };
  await rememberConsent(parsed.data);
  return { ok: true };
}
