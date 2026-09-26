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
