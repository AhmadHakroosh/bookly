"use server";

import { z } from "zod";
import { hasFlag } from "@/server/flags";
import {
  ApplyError,
  saveDraft,
  sendResumeLink,
  submitApplication,
  type SubmitResult,
} from "@/server/hiring/apply";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * The application page's actions (public). Each resolves the workspace from the host and lets
 * `server/hiring/apply.ts` check the window, the answers and the token; problems a candidate can
 * act on come back as text.
 */

async function workspace() {
  const ws = await getCurrentWorkspace();
  if (!ws || !(await hasFlag(ws, "hiring")))
    throw new ApplyError("This opportunity isn't available.", 404);
  return ws;
}

const answers = z.record(z.string().max(64), z.unknown());

export async function saveDraftAction(
  slug: string,
  token: string | null,
  raw: Record<string, unknown>,
): Promise<{ token: string; savedAt: string } | { error: string }> {
  // audit: read-only — the candidate's own draft; nothing reaches the team until they submit
  const parsed = answers.safeParse(raw);
  if (!parsed.success) return { error: "We couldn't save your last change." };
  try {
    const r = await saveDraft(await workspace(), slug, { token, answers: parsed.data });
    return { token: r.token, savedAt: r.savedAt.toISOString() };
  } catch (e) {
    if (e instanceof ApplyError) return { error: e.message };
    throw e;
  }
}

export async function resumeLinkAction(
  slug: string,
  token: string,
): Promise<{ sentTo: string } | { error: string }> {
  // audit: read-only — emails the candidate their own resume link; nothing is stored
  try {
    return await sendResumeLink(await workspace(), slug, token);
  } catch (e) {
    if (e instanceof ApplyError) return { error: e.message };
    throw e;
  }
}

export async function submitAction(
  slug: string,
  input: {
    token: string | null;
    answers: Record<string, unknown>;
    accommodations: string;
    consent: boolean;
    futureContact: boolean;
  },
): Promise<SubmitResult | { ok: false; error: string }> {
  // audit: by server/hiring/apply.ts
  const parsed = z
    .object({
      token: z.string().max(100).nullable(),
      answers,
      accommodations: z.string().max(8000),
      consent: z.boolean(),
      futureContact: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Reload the page and try again." };
  try {
    return await submitApplication(await workspace(), slug, parsed.data);
  } catch (e) {
    if (e instanceof ApplyError) return { ok: false, error: e.message };
    throw e;
  }
}
