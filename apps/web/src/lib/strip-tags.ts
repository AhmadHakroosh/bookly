/**
 * Removes anything that looks like a tag, repeating until nothing changes: a single pass leaves
 * `<<b>b>` as `<b>`, which is what CodeQL's "incomplete multi-character sanitization" is about.
 * For plain-text uses (transcript cues, heading ids), not an HTML sanitizer.
 */
export function stripTags(s: string): string {
  let out = s;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, "");
  } while (out !== prev);
  return out;
}
