import type { EventQuestion } from "@bookly/db/schema";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

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
