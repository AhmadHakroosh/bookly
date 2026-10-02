"use client";

import {
  useAudioTrack,
  useParticipantIds,
  useParticipantProperty,
  useVideoTrack,
} from "@daily-co/daily-react";
import {
  HandIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
  VideoIcon,
  VideoOffIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initials, type CallMessage } from "./messages";

export type Reaction = { id: string; emoji: string; name: string };

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2.5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Close ${title.toLowerCase()}`}
        onClick={onClose}
      >
        <XIcon />
      </Button>
    </div>
  );
}

/** In-call chat over Daily app messages: lives for the call only, nothing is stored. */
export function ChatPanel({
  messages,
  onSend,
  onClose,
}: {
  messages: Extract<CallMessage, { kind: "chat" }>[];
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);
  return (
    <>
      <PanelHeader title="Chat" onClose={onClose} />
      <ol
        ref={list}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <li className="text-muted-foreground">
            Messages are visible to everyone in the call and disappear when it ends.
          </li>
        )}
        {messages.map((m) => (
          <li key={m.id}>
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{m.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="break-words whitespace-pre-wrap">{m.text}</p>
          </li>
        ))}
      </ol>
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          onSend(t);
          setText("");
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message everyone"
          aria-label="Message"
          maxLength={2000}
          autoFocus
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim()}>
          <SendIcon />
        </Button>
      </form>
    </>
  );
}

/** Everyone in the call, plus the people knocking (hosts can let them in or turn them away). */
export function PeoplePanel({
  localId,
  isOwner,
  waiting,
  onAdmit,
  onDeny,
  onClose,
}: {
  localId: string;
  isOwner: boolean;
  waiting: { id: string; name?: string }[];
  onAdmit: (id: string) => void;
  onDeny: (id: string) => void;
  onClose: () => void;
}) {
  const ids = useParticipantIds({ sort: "joined_at" });
  return (
    <>
      <PanelHeader title="People" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 text-sm">
        {isOwner && waiting.length > 0 && (
          <section className="mb-3">
            <h3 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Waiting to join
            </h3>
            <ul className="space-y-1">
              {waiting.map((w) => (
                <li key={w.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                    {initials(w.name || "?")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{w.name || "Someone"}</span>
                  <Button size="xs" onClick={() => onAdmit(w.id)}>
                    Let in
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => onDeny(w.id)}>
                    Deny
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <h3 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          In the call ({ids.length})
        </h3>
        <ul className="space-y-1">
          {ids.map((id) => (
            <PersonRow key={id} id={id} local={id === localId} />
          ))}
        </ul>
      </div>
    </>
  );
}

function PersonRow({ id, local }: { id: string; local: boolean }) {
  const [name, owner, userData] = useParticipantProperty(id, ["user_name", "owner", "userData"]);
  const audio = useAudioTrack(id);
  const video = useVideoTrack(id);
  const label = (name as string | undefined)?.trim() || (local ? "You" : "Guest");
  const hand = (userData as { hand?: boolean } | null | undefined)?.hand === true;
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5">
      <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {initials(label)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {label}
        {local ? " (You)" : ""}
        {owner === true && <span className="ml-1.5 text-[11px] text-muted-foreground">Host</span>}
      </span>
      {hand && <HandIcon className="size-4 text-brand" aria-label="Hand raised" />}
      {audio.isOff ? (
        <MicOffIcon className="size-4 text-red-400" aria-label="Muted" />
      ) : (
        <MicIcon className="size-4 text-muted-foreground" aria-label="Unmuted" />
      )}
      {video.isOff ? (
        <VideoOffIcon className="size-4 text-muted-foreground" aria-label="Camera off" />
      ) : (
        <VideoIcon className="size-4 text-muted-foreground" aria-label="Camera on" />
      )}
    </li>
  );
}

/** Emoji reactions float up from the bottom of the stage and fade. */
export function ReactionsOverlay({ items }: { items: Reaction[] }) {
  if (!items.length) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
      aria-live="polite"
    >
      <div className="relative h-0 w-48">
        {items.map((r, i) => (
          <span
            key={r.id}
            className="meet-float absolute bottom-0 flex flex-col items-center text-3xl"
            style={{ left: `${(i * 37) % 100}%` }}
          >
            {r.emoji}
            <span className="rounded bg-black/60 px-1 text-[10px] text-white">{r.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
