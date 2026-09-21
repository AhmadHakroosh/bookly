/**
 * Pure part of the meeting recap: the model contract and a tolerant parser. Every item can
 * point at the transcript moment it came from (`t` seconds, `quote`) so the host can check it.
 */
import { z } from "zod";

const evidence = {
  t: z.number().min(0).nullable().default(null),
  quote: z.string().max(300).nullable().default(null),
};

export const recapSchema = z.object({
  summary: z.string().max(2000).default(""),
  decisions: z
    .array(z.object({ text: z.string().min(1).max(300), ...evidence }))
    .max(15)
    .default([]),
  actions: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        owner: z.enum(["me", "them"]).default("me"),
        dueInDays: z.number().int().min(0).max(365).nullable().default(null),
        ...evidence,
      }),
    )
    .max(20)
    .default([]),
  openQuestions: z.array(z.string().max(300)).max(10).default([]),
  objections: z
    .array(z.object({ text: z.string().min(1).max(300), ...evidence }))
    .max(10)
    .default([]),
  /** Did the meeting cover what they asked for when booking? */
  covered: z
    .array(
      z.object({
        asked: z.string().max(300),
        covered: z.boolean(),
        note: z.string().max(300).nullable().default(null),
      }),
    )
    .max(10)
    .default([]),
  nextStep: z.string().max(300).default(""),
  suggestedStage: z.enum(["lead", "active", "won", "lost"]).nullable().default(null),
  temperature: z.enum(["warm", "neutral", "cool"]).nullable().default(null),
  followUp: z
    .object({ subject: z.string().max(200), body: z.string().max(4000) })
    .nullable()
    .default(null),
  attendeeRecap: z
    .object({ subject: z.string().max(200), body: z.string().max(4000) })
    .nullable()
    .default(null),
});
export type Recap = z.infer<typeof recapSchema>;

export const RECAP_SYSTEM = `You turn the transcript of a consultant's client call into a recap the consultant will review and act on. Reply with JSON only, matching:
{"summary": string (3-5 sentences), "decisions": [{"text", "t": seconds|null, "quote": string|null}], "actions": [{"title", "owner": "me"|"them", "dueInDays": int|null, "t", "quote"}], "openQuestions": string[], "objections": [{"text", "t", "quote"}], "covered": [{"asked", "covered": bool, "note"}], "nextStep": string, "suggestedStage": "lead"|"active"|"won"|"lost"|null, "temperature": "warm"|"neutral"|"cool"|null, "followUp": {"subject","body"}|null, "attendeeRecap": {"subject","body"}|null}
Rules:
- "me" is the consultant (host), "them" the client (attendee). Put what THEY promised under actions with owner "them", phrased as what they will do.
- t is the transcript timestamp in seconds of the supporting line; quote is a short verbatim excerpt (max 20 words). Use null when unsure. Never invent quotes.
- dueInDays only when a deadline is stated or clearly implied.
- covered: one entry per thing the client asked for when booking (given below), whether the call addressed it.
- objections: concerns, risks, hesitations or pushback the client voiced.
- suggestedStage only when the relationship clearly moved (agreement → won, clear no → lost, ongoing work → active), else null. temperature is your read of the client's enthusiasm.
- followUp: a short, warm first-person email from the consultant to the client recapping decisions and next steps; no placeholders, no sign-off name.
- attendeeRecap: a neutral, client-facing recap (summary, decisions, who does what by when) the consultant could forward as-is; no internal remarks, no sign-off name.
- Only include what the transcript supports. Empty arrays are fine.`;

/** Parses the model's reply even when it wraps the JSON in prose or code fences. */
export function parseRecap(raw: string): Recap | null {
  const text = raw.trim();
  const candidates = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = recapSchema.safeParse(JSON.parse(c));
      if (parsed.success) return parsed.data;
    } catch {
      /* next candidate */
    }
  }
  return null;
}
