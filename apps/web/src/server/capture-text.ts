/**
 * Pure part of post-meeting capture: the model contract and a tolerant parser for its answer.
 */
import { z } from "zod";

export const captureSchema = z.object({
  summary: z.string().max(1500).default(""),
  decisions: z.array(z.string().max(300)).max(15).default([]),
  actions: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        /** Days from now; null = no date. */
        dueInDays: z.number().int().min(0).max(365).nullable().default(null),
        owner: z.enum(["me", "them"]).default("me"),
      }),
    )
    .max(15)
    .default([]),
  nextStep: z.string().max(300).default(""),
  suggestedStage: z.enum(["lead", "active", "won", "lost"]).nullable().default(null),
  followUp: z
    .object({ subject: z.string().max(200), body: z.string().max(4000) })
    .nullable()
    .default(null),
});
export type Capture = z.infer<typeof captureSchema>;

export const CAPTURE_SYSTEM = `You turn a consultant's meeting notes or transcript into structured follow-through. Reply with JSON only, matching:
{"summary": string (2-4 sentences), "decisions": string[], "actions": [{"title": string, "dueInDays": number|null, "owner": "me"|"them"}], "nextStep": string, "suggestedStage": "lead"|"active"|"won"|"lost"|null, "followUp": {"subject": string, "body": string}|null}
Rules: only include what the notes support; "me" is the consultant, "them" the client; dueInDays is a whole number of days from today when a deadline is stated or clearly implied, otherwise null; suggestedStage only when the notes clearly show the relationship moved (a signed deal → won, a clear no → lost, ongoing work → active), else null; followUp is a short, warm email from the consultant to the client recapping decisions and next steps, written in the first person, no placeholders, no sign-off name.`;

/** Parses the model's reply even when it wraps the JSON in prose or code fences. */
export function parseCapture(raw: string): Capture | null {
  const text = raw.trim();
  const candidates = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = captureSchema.safeParse(JSON.parse(c));
      if (parsed.success) return parsed.data;
    } catch {
      /* next candidate */
    }
  }
  return null;
}

/** Without a model: the notes become the summary and each "- " / "* " line an action. */
export function manualCapture(notes: string): Capture {
  const lines = notes.split(/\r?\n/).map((l) => l.trim());
  const actions = lines
    .filter((l) => /^[-*•]\s*(\[ \]\s*)?/.test(l))
    .map((l) => l.replace(/^[-*•]\s*(\[ \]\s*)?/, "").trim())
    .filter(Boolean)
    .slice(0, 15)
    .map((title) => ({ title: title.slice(0, 200), dueInDays: null, owner: "me" as const }));
  return {
    summary: notes.trim().slice(0, 1500),
    decisions: [],
    actions,
    nextStep: "",
    suggestedStage: null,
    followUp: null,
  };
}

export const dueDate = (days: number | null, now = new Date()) =>
  days === null ? null : new Date(now.getTime() + days * 86_400_000);
