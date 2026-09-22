"use client";

import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { EventQuestion } from "@bookly/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPES: [EventQuestion["type"], string][] = [
  ["text", "Short text"],
  ["textarea", "Long text"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["select", "Choice"],
];

/** Visual editor for booking questions; serialises to a hidden JSON field. */
export function QuestionBuilder({
  initial,
  onChange,
}: {
  initial: EventQuestion[];
  /** Lets a parent (the routing-form editor) follow the current question list. */
  onChange?: (questions: EventQuestion[]) => void;
}) {
  const [qs, setQs] = useState<EventQuestion[]>(initial);
  useEffect(() => {
    onChange?.(qs);
  }, [qs, onChange]);
  const update = (i: number, patch: Partial<EventQuestion>) =>
    setQs((all) => all.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, dir: -1 | 1) =>
    setQs((all) => {
      const j = i + dir;
      if (j < 0 || j >= all.length) return all;
      const copy = [...all];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  return (
    <div className="space-y-2">
      <input type="hidden" name="questionsJson" value={JSON.stringify(qs)} />
      {qs.map((q, i) => (
        <div key={q.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_140px_auto]">
          <Input
            value={q.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Question"
            aria-label="Question label"
          />
          <select
            value={q.type}
            onChange={(e) => update(i, { type: e.target.value as EventQuestion["type"] })}
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            aria-label="Answer type"
          >
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              Required
            </label>
            <button type="button" onClick={() => move(i, -1)} aria-label="Move up" className="px-1">
              <ChevronUpIcon className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              aria-label="Move down"
              className="px-1"
            >
              <ChevronDownIcon className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setQs((all) => all.filter((_, j) => j !== i))}
              className="px-1 text-destructive"
              aria-label="Remove question"
            >
              <XIcon className="size-4" aria-hidden />
            </button>
          </div>
          {q.type === "select" && (
            <Input
              className="sm:col-span-3"
              value={(q.options ?? []).join(", ")}
              onChange={(e) =>
                update(i, {
                  options: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Choices, comma-separated"
              aria-label="Choices"
            />
          )}
        </div>
      ))}
      {qs.length < 12 && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setQs((all) => [
              ...all,
              { id: `q${Date.now().toString(36)}`, label: "", type: "text", required: false },
            ])
          }
        >
          Add question
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Name and email are always asked.</p>
    </div>
  );
}
