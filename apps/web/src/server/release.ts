import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** The repository's CHANGELOG.md: at the repo root in development, copied into the image in Docker. */
async function changelog(): Promise<string> {
  for (const p of [
    path.join(process.cwd(), "CHANGELOG.md"),
    path.join(process.cwd(), "..", "..", "CHANGELOG.md"),
  ]) {
    try {
      return await readFile(/*turbopackIgnore: true*/ p, "utf8");
    } catch {
      /* try next */
    }
  }
  return "";
}

/** Date of the newest release section in the changelog (`## [x.y.z] - YYYY-MM-DD`), or null. */
export async function latestReleaseDate(): Promise<Date | null> {
  const m = (await changelog()).match(/^## \[\d+\.\d+\.\d+\] - (\d{4}-\d{2}-\d{2})/m);
  return m ? new Date(`${m[1]}T00:00:00Z`) : null;
}

export type Release = { version: string; date: string; headline: string };

/**
 * The newest released versions with each one's first headline (the bold lead of its first
 * entry, or the entry itself), for the Resources page's changelog card.
 */
export async function recentReleases(count: number): Promise<Release[]> {
  const md = await changelog();
  const out: Release[] = [];
  const re = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\n([\s\S]*?)(?=^## |(?![\s\S]))/gm;
  for (const m of md.matchAll(re)) {
    const entry = m[3]!.match(/^- (.+)$/m)?.[1] ?? "";
    const bold = entry.match(/^\*\*(.+?)\*\*/)?.[1];
    const headline = (bold ?? entry)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*`]/g, "")
      .replace(/\.$/, "");
    out.push({ version: m[1]!, date: m[2]!, headline: headline.slice(0, 90) });
    if (out.length === count) break;
  }
  return out;
}
