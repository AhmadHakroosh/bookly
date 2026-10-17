/**
 * Pure part of in-meeting notes (0.20.0): cleaning what the call page sends, and the two ways
 * notes are written out: for the recap (offsets against the transcript) and for the timeline
 * (time of day). No database here, so it is unit-tested directly.
 */
import type { MeetingNoteEntry } from "@bookly/db/schema";

export const MAX_ENTRIES = 300;
export const MAX_TEXT = 2000;

/** What the call page sent, made safe: known fields only, real dates, sane sizes, in time order. */
export function cleanEntries(input: unknown): MeetingNoteEntry[] {
  if (!Array.isArray(input)) return [];
  const out: MeetingNoteEntry[] = [];
  for (const raw of input.slice(0, MAX_ENTRIES * 2)) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id.slice(0, 40) : "";
    const at = typeof e.at === "string" && !Number.isNaN(Date.parse(e.at)) ? e.at : "";
    const text = typeof e.text === "string" ? e.text.trim().slice(0, MAX_TEXT) : "";
    const moment = e.moment === true;
    if (!id || !at || (!text && !moment)) continue;
    out.push({ id, at: new Date(at).toISOString(), text, ...(moment ? { moment: true } : {}) });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, MAX_ENTRIES);
}

/** Seconds from `start` (the transcript's start) to the entry, never negative. */
export function offsetOf(at: string, start: Date | null): number | null {
  if (!start) return null;
  return Math.max(0, Math.round((Date.parse(at) - start.getTime()) / 1000));
}

/** 75 → "01:15", 3725 → "1:02:05": the transcript's own clock format. */
export function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const line = (e: MeetingNoteEntry) =>
  e.moment ? `⚑ Marked moment${e.text ? `: ${e.text}` : ""}` : e.text;

/**
 * The notes as the recap model reads them: one line each, stamped with the transcript clock when
 * there is a transcript (so a note at [12:30] sits next to what was said at 12:30).
 */
export function notesForRecap(
  authors: { name: string; entries: MeetingNoteEntry[] }[],
  transcriptStart: Date | null,
): string {
  const many = authors.filter((a) => a.entries.length).length > 1;
  return authors
    .flatMap((a) =>
      a.entries.map((e) => {
        const t = offsetOf(e.at, transcriptStart);
        return `${t === null ? "" : `[${clock(t)}] `}${many ? `(${a.name}) ` : ""}${line(e)}`;
      }),
    )
    .join("\n");
}

/** The notes as the contact's timeline shows them: time of day in the host's timezone. */
export function notesForTimeline(entries: MeetingNoteEntry[], timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  return entries.map((e) => `${fmt.format(new Date(e.at))}  ${line(e)}`).join("\n");
}
