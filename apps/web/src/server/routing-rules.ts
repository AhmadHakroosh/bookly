/**
 * Pure routing-form evaluation: first rule whose conditions hold wins, else the fallback.
 * Comparisons are case-insensitive and trimmed so "Yes" matches "yes ". The conditions are
 * evaluated by the forms engine (ADR 0004), the one evaluator shared with forms and stage rules.
 */
import type { RoutingCondition, RoutingDestination, RoutingRule } from "@bookly/db/schema";
import { conditionHolds as formConditionHolds } from "@bookly/forms";

export function conditionHolds(c: RoutingCondition, answers: Record<string, string>): boolean {
  return formConditionHolds({ fieldId: c.questionId, op: c.op, value: c.value }, answers);
}

export function ruleMatches(rule: RoutingRule, answers: Record<string, string>): boolean {
  if (!rule.conditions.length) return true;
  return rule.match === "any"
    ? rule.conditions.some((c) => conditionHolds(c, answers))
    : rule.conditions.every((c) => conditionHolds(c, answers));
}

export function routeAnswers(
  form: { rules: RoutingRule[]; fallback: RoutingDestination | null },
  answers: Record<string, string>,
): RoutingDestination | null {
  for (const r of form.rules) if (ruleMatches(r, answers)) return r.destination;
  return form.fallback ?? null;
}

/** Validates rules coming from the admin builder (JSON in a hidden field). */
export function parseRulesJson(json: string, knownEventTypeIds: Set<string>): RoutingRule[] {
  if (!json.trim()) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: RoutingRule[] = [];
  for (const r of raw.slice(0, 30) as Partial<RoutingRule>[]) {
    const destination = parseDestination(r.destination, knownEventTypeIds);
    if (!destination) continue;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : crypto.randomUUID().slice(0, 8),
      match: r.match === "any" ? "any" : "all",
      conditions: (Array.isArray(r.conditions) ? r.conditions : [])
        .slice(0, 10)
        .filter(
          (c): c is RoutingCondition =>
            !!c &&
            typeof c.questionId === "string" &&
            ["equals", "not_equals", "contains", "not_empty"].includes(String(c.op)),
        )
        .map((c) => ({
          questionId: c.questionId,
          op: c.op,
          value: String(c.value ?? "").slice(0, 200),
        })),
      destination,
    });
  }
  return out;
}

export function parseDestination(
  d: unknown,
  knownEventTypeIds: Set<string>,
): RoutingDestination | null {
  if (!d || typeof d !== "object") return null;
  const x = d as Record<string, unknown>;
  if (
    x.type === "event_type" &&
    typeof x.eventTypeId === "string" &&
    knownEventTypeIds.has(x.eventTypeId)
  )
    return { type: "event_type", eventTypeId: x.eventTypeId };
  if (x.type === "url" && typeof x.url === "string" && /^https?:\/\//.test(x.url))
    return { type: "url", url: x.url.slice(0, 2000) };
  if (x.type === "message" && typeof x.text === "string" && x.text.trim())
    return { type: "message", text: x.text.slice(0, 2000) };
  return null;
}
