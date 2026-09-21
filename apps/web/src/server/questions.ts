import type { EventQuestion } from "@bookly/db/schema";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/** Questions from the visual builder (JSON array); invalid input yields an empty list. */
export function parseQuestionsJson(json: string): EventQuestion[] {
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
      .map((q, i) => {
        const label = String(q.label ?? "")
          .trim()
          .slice(0, 120);
        const type = (["text", "textarea", "email", "phone", "select"] as const).includes(
          q.type as never,
        )
          ? (q.type as EventQuestion["type"])
          : "text";
        return {
          id: typeof q.id === "string" && q.id ? q.id.slice(0, 40) : `q${i + 1}_${slugify(label)}`,
          label,
          type,
          required: !!q.required,
          options:
            type === "select" && Array.isArray(q.options)
              ? q.options
                  .map(String)
                  .map((o) => o.trim())
                  .filter(Boolean)
                  .slice(0, 30)
              : undefined,
        };
      })
      .filter((q) => q.label)
      .slice(0, 12);
  } catch {
    return [];
  }
}

/** "1440, 60" → [1440, 60]; keeps 5 min … 30 days, unique, descending. */
export function parseReminders(text: string): number[] {
  const nums = text
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= 5 && n <= 30 * 24 * 60)
    .map((n) => Math.round(n));
  return [...new Set(nums)].sort((a, b) => b - a).slice(0, 6);
}

/** Questions are one per line: `Label | text|textarea|email|phone|select | required | option1,option2` */
export function parseQuestions(text: string): EventQuestion[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((l, i) => {
      const [label, type = "text", req = "", opts = ""] = l.split("|").map((s) => s.trim());
      const t = (["text", "textarea", "email", "phone", "select"] as const).includes(type as never)
        ? (type as EventQuestion["type"])
        : "text";
      return {
        id: `q${i + 1}_${slugify(label ?? "q").slice(0, 20) || i}`,
        label: (label ?? "Question").slice(0, 120),
        type: t,
        required: /^(y|yes|true|required|1)$/i.test(req),
        options:
          t === "select"
            ? opts
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean)
            : undefined,
      };
    });
}
