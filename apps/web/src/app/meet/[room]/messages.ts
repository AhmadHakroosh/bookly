/**
 * Pure helpers for the Bookly call UI: the app-message protocol (chat, reactions) exchanged
 * through Daily's `sendAppMessage`, tile-grid maths and small formatting utilities. Kept free
 * of React and Daily so they can be unit tested.
 */

export type CallMessage =
  | { kind: "chat"; id: string; name: string; text: string; at: number }
  | { kind: "reaction"; id: string; name: string; emoji: string; at: number };

export const REACTIONS = ["👍", "👏", "❤️", "😂", "🎉", "🤔"] as const;

export const messageId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Validates an incoming app message; anything malformed (or from a third-party script) is dropped. */
export function parseCallMessage(data: unknown): CallMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const name = typeof d.name === "string" ? d.name.trim().slice(0, 60) || "Someone" : "Someone";
  const at = typeof d.at === "number" && Number.isFinite(d.at) ? d.at : Date.now();
  const id = typeof d.id === "string" && d.id ? d.id.slice(0, 40) : messageId();
  if (d.kind === "chat" && typeof d.text === "string" && d.text.trim())
    return { kind: "chat", id, name, text: d.text.trim().slice(0, 2000), at };
  if (
    d.kind === "reaction" &&
    typeof d.emoji === "string" &&
    (REACTIONS as readonly string[]).includes(d.emoji)
  )
    return { kind: "reaction", id, name, emoji: d.emoji, at };
  return null;
}

/**
 * Columns for `count` 16:9 tiles in a `width`×`height` area: the column count whose tiles end
 * up largest. One column for a single tile, never more columns than tiles.
 */
export function gridColumns(count: number, width: number, height: number): number {
  if (count <= 1 || width <= 0 || height <= 0) return 1;
  let best = 1;
  let bestWidth = 0;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileWidth = Math.min(width / cols, (height / rows) * (16 / 9));
    if (tileWidth > bestWidth) {
      bestWidth = tileWidth;
      best = cols;
    }
  }
  return best;
}

/** Width of each tile for the chosen column count, so a grid of 16:9 tiles fits the area. */
export function tileWidth(count: number, cols: number, width: number, height: number, gap = 8) {
  const rows = Math.max(1, Math.ceil(count / Math.max(1, cols)));
  const byWidth = (width - gap * (cols - 1)) / cols;
  const byHeight = ((height - gap * (rows - 1)) / rows) * (16 / 9);
  return Math.max(80, Math.floor(Math.min(byWidth, byHeight)));
}

/** "Ahmad Hakroosh" → "AH"; "ahmad" → "A"; "" → "?". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** The language Deepgram detected for a line, when the call is transcribed multilingually. */
export function detectedLang(raw: unknown): string | undefined {
  const alt = (raw as { channel?: { alternatives?: { languages?: unknown }[] } } | undefined)
    ?.channel?.alternatives?.[0];
  const langs = Array.isArray(alt?.languages) ? alt.languages : [];
  return langs.find((l): l is string => typeof l === "string" && l.length > 0);
}
