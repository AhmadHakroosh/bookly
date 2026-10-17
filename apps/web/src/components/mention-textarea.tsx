"use client";

import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

export type MentionPerson = { id: string; name: string };

/**
 * A textarea where typing "@" offers teammates (arrow keys, Enter or Tab to pick); the server
 * reads `@Name` back with `parseMentions`. Controlled: the form owns the text.
 */
export function MentionTextarea({
  id,
  name,
  value,
  onValueChange,
  people,
  ariaLabel,
  placeholder,
  rows = 3,
  maxLength = 4000,
}: {
  /** Prefix for the suggestion list's element ids (unique on the page). */
  id: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  people: MentionPerson[];
  ariaLabel: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const matches =
    query === null
      ? []
      : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const onChange = (next: string, caret: number) => {
    onValueChange(next);
    const before = next.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    setQuery(m && people.length ? m[2]! : null);
    setHighlight(0);
  };

  const insert = (p: MentionPerson) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${p.name} `);
    onValueChange(before + value.slice(caret));
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        name={name}
        value={value}
        rows={rows}
        maxLength={maxLength}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "Escape") return setQuery(null);
          const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (step) {
            e.preventDefault();
            setHighlight((h) => (h + step + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insert(matches[highlight]!);
          }
        }}
        aria-autocomplete="list"
        aria-controls={matches.length ? `mentions-${id}` : undefined}
        aria-activedescendant={matches.length ? `mention-${id}-${highlight}` : undefined}
      />
      {matches.length > 0 && (
        <ul
          id={`mentions-${id}`}
          role="listbox"
          aria-label="Teammates"
          className="absolute top-full left-0 z-10 mt-1 w-56 overflow-hidden rounded-lg border bg-popover text-sm shadow-md"
        >
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`mention-${id}-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(p);
              }}
              className={`cursor-pointer px-3 py-1.5 ${i === highlight ? "bg-muted" : ""}`}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
