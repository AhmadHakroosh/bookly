"use client";

import { FlagIcon, Trash2Icon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type NoteEntry = { id: string; at: string; text: string; moment?: boolean };
type SaveState = "idle" | "saving" | "saved" | "error";

const newId = () => Math.random().toString(36).slice(2, 10);
const timeOf = (at: string) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The host's private notes for this call: loaded once, every change saved (debounced) to
 * /api/meet/<room>/notes. Lives at the room level so "mark moment" works with the panel closed.
 */
export function useMeetingNotes(room: string, enabled: boolean) {
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [state, setState] = useState<SaveState>("idle");
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<NoteEntry[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetch(`/api/meet/${room}/notes`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d: { entries?: NoteEntry[] }) => {
        if (!alive) return;
        loaded.current = true;
        // Anything typed before the load finished stays, after what was saved.
        setEntries((typed) => {
          const next = [...(d.entries ?? []), ...typed];
          latest.current = next;
          return next;
        });
      })
      .catch(() => {
        loaded.current = true;
      });
    return () => {
      alive = false;
    };
  }, [room, enabled]);

  const save = useCallback(
    function save() {
      // Never save before the saved notes are in, or the first save would drop them.
      if (!loaded.current) {
        timer.current = setTimeout(save, 500);
        return;
      }
      setState("saving");
      void fetch(`/api/meet/${room}/notes`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: latest.current }),
        keepalive: true,
      })
        .then((r) => setState(r.ok ? "saved" : "error"))
        .catch(() => setState("error"));
    },
    [room],
  );

  const change = useCallback(
    (fn: (prev: NoteEntry[]) => NoteEntry[]) => {
      setEntries((prev) => {
        const next = fn(prev);
        latest.current = next;
        return next;
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, 700);
    },
    [save],
  );

  // Leaving the page flushes a pending save.
  useEffect(() => {
    const flush = () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      save();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [save]);

  return {
    entries,
    state,
    add: (text: string) =>
      change((prev) => [...prev, { id: newId(), at: new Date().toISOString(), text }]),
    mark: () =>
      change((prev) => [
        ...prev,
        { id: newId(), at: new Date().toISOString(), text: "", moment: true },
      ]),
    update: (id: string, text: string) =>
      change((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e))),
    remove: (id: string) => change((prev) => prev.filter((e) => e.id !== id)),
  };
}

export type MeetingNotesApi = ReturnType<typeof useMeetingNotes>;

/**
 * The notes so far (editable), a box to add one, and "Mark moment": the call's side panel, and
 * (without `onClose`) the notes section of the booking page after the call.
 */
export function NotesPanel({
  notes,
  onClose,
  inCall = true,
}: {
  notes: MeetingNotesApi;
  onClose?: () => void;
  /** In the call: focus the box and offer Mark moment; on the booking page, neither. */
  inCall?: boolean;
}) {
  const [text, setText] = useState("");
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [notes.entries.length]);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    notes.add(t);
    setText("");
  };
  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Your notes</h2>
          <p className="text-xs text-muted-foreground" role="status">
            Only you see these ·{" "}
            {notes.state === "saving"
              ? "Saving…"
              : notes.state === "error"
                ? "Not saved, retrying on the next change"
                : notes.state === "saved"
                  ? "Saved"
                  : "They feed the recap"}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label="Close notes" onClick={onClose}>
            <XIcon />
          </Button>
        )}
      </div>
      <ol
        ref={list}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm"
        aria-label="Notes"
      >
        {notes.entries.length === 0 && (
          <li className="text-muted-foreground">
            Write what matters as it happens; each note keeps its time, so the recap can match it to
            what was said. Mark a moment (⌘/Ctrl+Shift+M) to come back to it.
          </li>
        )}
        {notes.entries.map((e) => (
          <li key={e.id} className="group flex items-start gap-2">
            <span className="mt-1.5 shrink-0 font-mono text-xs text-muted-foreground">
              {timeOf(e.at)}
            </span>
            {e.moment && (
              <FlagIcon
                className="mt-2 size-3.5 shrink-0 text-amber-400"
                aria-label="Marked moment"
              />
            )}
            <input
              value={e.text}
              onChange={(ev) => notes.update(e.id, ev.target.value)}
              placeholder={e.moment ? "Marked moment: add a word (optional)" : ""}
              aria-label={e.moment ? "Marked moment label" : `Note at ${timeOf(e.at)}`}
              maxLength={2000}
              className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 outline-none hover:bg-muted/40 focus:bg-muted/60"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              aria-label={`Delete the note at ${timeOf(e.at)}`}
              onClick={() => notes.remove(e.id)}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ol>
      <div className="space-y-2 border-t p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Write a note, Enter to add"
          aria-label="New note"
          autoFocus={inCall}
        />
        <div className="flex items-center justify-between gap-2">
          {inCall ? (
            <Button type="button" variant="outline" size="sm" onClick={notes.mark}>
              <FlagIcon data-icon="inline-start" />
              Mark moment
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" disabled={!text.trim()} onClick={add}>
            Add note
          </Button>
        </div>
      </div>
    </>
  );
}
