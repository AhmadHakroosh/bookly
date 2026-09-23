"use client";

import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import type { EventQuestion } from "@bookly/db/schema";
import { shortId } from "@/lib/id";
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
        <div key={q.id} className="space-y-2 rounded-lg border p-2">
          {/* Small screens: the question text on its own line, the controls on the next. */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Question"
              aria-label="Question label"
              className="min-w-0 basis-full sm:flex-1 sm:basis-0"
            />
            <select
              value={q.type}
              onChange={(e) => update(i, { type: e.target.value as EventQuestion["type"] })}
              className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm sm:w-28 sm:flex-none"
              aria-label="Answer type"
            >
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <label className="inline-flex shrink-0 items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              Required
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Move up"
              className="shrink-0"
            >
              <ChevronUpIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => move(i, 1)}
              disabled={i === qs.length - 1}
              aria-label="Move down"
              className="shrink-0"
            >
              <ChevronDownIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setQs((all) => all.filter((_, j) => j !== i))}
              aria-label="Remove question"
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon />
            </Button>
          </div>
          {q.type === "select" && (
            <Input
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
              { id: `q${shortId(6)}`, label: "", type: "text", required: false },
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
