/**
 * Pure helpers for meeting transcripts: WebVTT parsing (Daily's stored file), merging the live
 * speaker-labelled feed with the stored text, and rendering for the model / the host.
 */
import { stripTags } from "@/lib/strip-tags";
import type { TranscriptSegment } from "@bookly/db/schema";

const toSeconds = (ts: string) => {
  const [h, m, s] = ts.trim().split(":");
  const parts = [h, m, s].filter((x) => x !== undefined) as string[];
  const sec = parts.pop()!;
  const [ss, ms = "0"] = sec.split(/[.,]/);
  let total = Number(ss) + Number(ms.padEnd(3, "0").slice(0, 3)) / 1000;
  if (parts.length) total += Number(parts.pop()) * 60;
  if (parts.length) total += Number(parts.pop()) * 3600;
  return Math.round(total * 10) / 10;
};

/** Parses WebVTT cues. Speaker tags (`<v Name>`) become the speaker; otherwise "unknown". */
export function parseVtt(vtt: string): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  const blocks = vtt.replace(/\r/g, "").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim());
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const start = lines[ti]!.split("-->")[0]!;
    const text = lines
      .slice(ti + 1)
      .join(" ")
      .trim();
    if (!text) continue;
    const m = text.match(/^<v\s+([^>]+)>\s*([\s\S]*)$/);
    out.push({
      t: toSeconds(start),
      speaker: m ? m[1]!.trim() : "unknown",
      text: stripTags(m ? m[2]! : text).trim(),
    });
  }
  return out;
}

/**
 * Prefers the live feed (it carries speakers); the stored file fills gaps where the live feed
 * has nothing for more than `gapSeconds`.
 */
export function mergeSegments(
  live: TranscriptSegment[],
  stored: TranscriptSegment[],
  gapSeconds = 20,
) {
  if (!live.length) return stored;
  if (!stored.length) return live;
  const out = [...live];
  for (const s of stored) {
    const near = live.some((l) => Math.abs(l.t - s.t) <= gapSeconds);
    if (!near) out.push(s);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** "English, Spanish" from Deepgram's codes; unknown codes are shown as they are. */
export function languageNames(codes: string[], locale = "en"): string {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
  } catch {
    names = null;
  }
  return codes
    .map((c) => {
      try {
        return names?.of(c) ?? c;
      } catch {
        return c;
      }
    })
    .join(", ");
}

const clock = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/**
 * "[03:12] host: …" lines; speakers replaced with real names when given. On a call that
 * switched languages, each line also carries its language code ("[03:12] host (es): …").
 */
export function renderTranscript(
  segments: TranscriptSegment[],
  names: { host?: string; attendee?: string } = {},
): string {
  const multilingual = new Set(segments.map((s) => s.lang).filter(Boolean)).size > 1;
  return segments
    .map((s) => {
      const who =
        s.speaker === "host"
          ? (names.host ?? "Host")
          : s.speaker === "attendee"
            ? (names.attendee ?? "Attendee")
            : s.speaker;
      const lang = multilingual && s.lang ? ` (${s.lang})` : "";
      return `[${clock(s.t)}] ${who}${lang}: ${s.text}`;
    })
    .join("\n");
}

export const transcriptWords = (segments: TranscriptSegment[]) =>
  segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
