"use client";

import {
  DailyAudio,
  DailyVideo,
  useActiveSpeakerId,
  useAppMessage,
  useAudioTrack,
  useDaily,
  useLocalSessionId,
  useParticipantIds,
  useParticipantProperty,
  useRoomExp,
  useScreenShare,
  useVideoTrack,
  useWaitingParticipants,
} from "@daily-co/daily-react";
import { MicOffIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VideoTile } from "@/components/ui/call-controls";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Captions, TranscriptPanel, type Line } from "./captions";
import { gridColumns, messageId, parseCallMessage, tileWidth, type CallMessage } from "./messages";
import { initials } from "./messages";
import { NotesPanel, useMeetingNotes } from "./notes";
import { ChatPanel, PeoplePanel, ReactionsOverlay, type Reaction } from "./panels";
import { Tray, type Panel } from "./tray";

/** What the side panel's Transcript tab shows: the live lines, labelled with names. */
export type LiveTranscript = { lines: Line[]; hostName: string; attendeeName: string };

const PANEL_LABEL: Record<Panel, string> = {
  notes: "Notes",
  transcript: "Transcript",
  chat: "Chat",
  people: "People",
};

/**
 * The call itself (`mocks.png` 04): the stage with the tiles, the side panel with its tabs
 * (Notes for the member taking them, Transcript while capture is on, Chat, People), the control
 * bar, remote audio. The panel starts open on a wide screen and closed on a phone.
 */
export function Room({
  hostName,
  room,
  notesEnabled,
  transcript,
  onLeave,
}: {
  hostName: string;
  room: string;
  /** In-meeting notes for this member (signed in, on a plan with notes). */
  notesEnabled: boolean;
  /** Capture is on: the Transcript tab, and the last lines under the stage while it is hidden. */
  transcript: LiveTranscript | null;
  onLeave: () => void;
}) {
  const call = useDaily();
  const localId = useLocalSessionId();
  const localName = useParticipantProperty(localId, "user_name");
  const isOwner = useParticipantProperty(localId, "owner") === true;
  const canNote = notesEnabled && isOwner;
  const notes = useMeetingNotes(room, canNote);
  const [marked, setMarked] = useState(false);
  const markMoment = useCallback(() => {
    notes.mark();
    setMarked(true);
    setTimeout(() => setMarked(false), 1800);
  }, [notes]);
  // Read by the keyboard handler, which is set up once.
  const markRef = useRef(markMoment);
  useEffect(() => {
    markRef.current = markMoment;
  }, [markMoment]);
  const tabs: Panel[] = [
    ...(canNote ? (["notes"] as const) : []),
    ...(transcript ? (["transcript"] as const) : []),
    "chat",
    "people",
  ];
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const [chosen, setChosen] = useState<Panel | null>(null);
  const tab = chosen && tabs.includes(chosen) ? chosen : tabs[0]!;
  // Read by the app-message handler (an event callback) to count unread chat lines.
  const chatVisible = useRef(false);
  useEffect(() => {
    chatVisible.current = open && tab === "chat";
  }, [open, tab]);
  const [messages, setMessages] = useState<Extract<CallMessage, { kind: "chat" }>[]>([]);
  const [unread, setUnread] = useState(0);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);

  const addReaction = useCallback((r: Reaction) => {
    setReactions((prev) => [...prev.slice(-11), r]);
    setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== r.id)), 2600);
  }, []);
  const sendAppMessage = useAppMessage<CallMessage>({
    onAppMessage: useCallback(
      (ev) => {
        const m = parseCallMessage(ev.data);
        if (!m) return;
        if (m.kind === "chat") {
          setMessages((prev) => [...prev, m]);
          if (!chatVisible.current) setUnread((u) => u + 1);
        } else addReaction({ id: m.id, emoji: m.emoji, name: m.name });
      },
      [addReaction],
    ),
  });
  const me = (localName as string | undefined) || "You";
  const sendChat = (text: string) => {
    const m: CallMessage = { kind: "chat", id: messageId(), name: me, text, at: Date.now() };
    sendAppMessage(m);
    setMessages((prev) => [...prev, m]);
  };
  const sendReaction = (emoji: string) => {
    const m: CallMessage = { kind: "reaction", id: messageId(), name: me, emoji, at: Date.now() };
    sendAppMessage(m);
    addReaction({ id: m.id, emoji, name: "You" });
  };
  const show = (p: Panel) => {
    setChosen(p);
    setOpen(true);
    if (p === "chat") setUnread(0);
  };

  // Knocking: the host sees who is waiting and can let them in from the banner or People.
  const { waitingParticipants, grantAccess, denyAccess } = useWaitingParticipants();
  const waiting = isOwner ? waitingParticipants : [];

  // Keyboard: ⌘/Ctrl+D mic, ⌘/Ctrl+E camera (the same as the common conferencing apps);
  // ⌘/Ctrl+Shift+M marks a moment in the notes, even while typing one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !call) return;
      if (canNote && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        markRef.current();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        call.setLocalAudio(!call.localAudio());
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        call.setLocalVideo(!call.localVideo());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [call, canNote]);

  const { ejectDate } = useRoomExp();
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!ejectDate) return;
    const tick = () => setMinutesLeft(Math.ceil((ejectDate.getTime() - Date.now()) / 60_000));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [ejectDate]);

  return (
    <TooltipProvider>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {waiting.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-center gap-2 border-b bg-accent px-4 py-2 text-sm"
            role="status"
          >
            <span>
              <strong>{waiting[0].name || "Someone"}</strong> would like to join
              {waiting.length > 1 ? ` (and ${waiting.length - 1} more)` : ""}.
            </span>
            <Button size="sm" onClick={() => grantAccess(waiting[0].id)}>
              Let in
            </Button>
            <Button size="sm" variant="outline" onClick={() => denyAccess(waiting[0].id)}>
              Deny
            </Button>
            {waiting.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => grantAccess("*")}>
                Let everyone in
              </Button>
            )}
          </div>
        )}
        {minutesLeft !== null && minutesLeft <= 10 && minutesLeft > 0 && (
          <p className="bg-warning-muted px-4 py-1 text-center text-xs text-warning" role="status">
            This room closes in {minutesLeft} minute{minutesLeft === 1 ? "" : "s"}.
          </p>
        )}
        <div className="relative flex min-h-0 flex-1">
          <div ref={stageRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <Stage localId={localId} hostName={hostName} />
              <ReactionsOverlay items={reactions} />
            </div>
            {transcript && !(open && tab === "transcript") && (
              <Captions {...transcript} lines={transcript.lines.slice(-3)} />
            )}
          </div>
          {marked && (
            <p
              className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-ink-foreground"
              role="status"
            >
              Moment marked
            </p>
          )}
          {open && (
            <aside
              aria-label="Side panel"
              className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l bg-background lg:static lg:w-[22rem]"
            >
              <div className="flex items-center gap-1 border-b px-2">
                <div role="tablist" aria-label="Side panel" className="flex min-w-0 flex-1 gap-1">
                  {tabs.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => show(t)}
                      className={cn(
                        "-mb-px border-b-2 px-2.5 py-2.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        tab === t
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {PANEL_LABEL[t]}
                      {t === "chat" && unread > 0 && (
                        <span className="ms-1 tabular-nums">({unread})</span>
                      )}
                      {t === "people" && waiting.length > 0 && (
                        <span className="ms-1 tabular-nums">({waiting.length})</span>
                      )}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Hide the panel"
                  onClick={() => setOpen(false)}
                >
                  <XIcon />
                </Button>
              </div>
              <div
                role="tabpanel"
                aria-label={PANEL_LABEL[tab]}
                className="flex min-h-0 flex-1 flex-col"
              >
                {tab === "notes" && canNote ? (
                  <NotesPanel notes={notes} />
                ) : tab === "transcript" && transcript ? (
                  <TranscriptPanel {...transcript} />
                ) : tab === "chat" ? (
                  <ChatPanel messages={messages} onSend={sendChat} />
                ) : (
                  <PeoplePanel
                    localId={localId}
                    isOwner={isOwner}
                    waiting={waiting}
                    onAdmit={grantAccess}
                    onDeny={denyAccess}
                  />
                )}
              </div>
            </aside>
          )}
        </div>
        <Tray
          panelOpen={open}
          onTogglePanel={() => (open ? setOpen(false) : show(tab))}
          unread={unread}
          waitingCount={waiting.length}
          notes={canNote ? { onMark: markMoment } : null}
          onReaction={sendReaction}
          onLeave={onLeave}
          stageRef={stageRef}
        />
        <DailyAudio />
      </div>
    </TooltipProvider>
  );
}

/** Tiles in a fitted grid, or the shared screen with a strip of tiles under it. */
function Stage({ localId, hostName }: { localId: string; hostName: string }) {
  const ids = useParticipantIds({ sort: "joined_at" });
  const { screens } = useScreenShare();
  const activeId = useActiveSpeakerId({ ignoreLocal: true });
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const screen = screens[0];
  if (screen)
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 p-2">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-neutral-900">
          <DailyVideo
            sessionId={screen.session_id}
            type="screenVideo"
            fit="contain"
            className="h-full w-full"
          />
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
            {screen.local ? "You are sharing your screen" : "Shared screen"}
          </span>
        </div>
        <div className="flex h-24 shrink-0 gap-2 overflow-x-auto">
          {ids.map((id) => (
            <div key={id} className="h-full shrink-0" style={{ width: 96 * (16 / 9) }}>
              <Tile
                id={id}
                local={id === localId}
                speaking={id === activeId}
                hostName={hostName}
                compact
              />
            </div>
          ))}
        </div>
      </div>
    );
  const cols = gridColumns(ids.length, size.width - 16, size.height - 16);
  const width = tileWidth(ids.length, cols, size.width - 16, size.height - 16);
  return (
    <div ref={ref} className="flex h-full items-center justify-center p-2">
      <div
        className="grid justify-center gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, ${width}px)` }}
      >
        {ids.map((id) => (
          <div key={id} style={{ width }}>
            <Tile id={id} local={id === localId} speaking={id === activeId} hostName={hostName} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({
  id,
  local,
  speaking,
  hostName,
  compact = false,
}: {
  id: string;
  local: boolean;
  speaking: boolean;
  hostName: string;
  compact?: boolean;
}) {
  const video = useVideoTrack(id);
  const audio = useAudioTrack(id);
  const [name, owner, userData] = useParticipantProperty(id, ["user_name", "owner", "userData"]);
  const label = (name as string | undefined)?.trim() || (local ? "You" : "Guest");
  const hand = (userData as { hand?: boolean } | null | undefined)?.hand === true;
  const isHost = owner === true || (!!hostName && label.toLowerCase() === hostName.toLowerCase());
  return (
    <VideoTile
      className={cn("w-full", speaking && "ring-2 ring-primary")}
      name={
        <>
          {audio.isOff && (
            <MicOffIcon className="size-3.5 shrink-0 text-red-300" aria-label="Muted" />
          )}
          <span className="truncate">
            {label}
            {local ? " (You)" : ""}
          </span>
          {isHost && !compact && (
            <span className="rounded bg-white/20 px-1 py-px text-[10px] tracking-wide uppercase">
              Host
            </span>
          )}
        </>
      }
    >
      {video.isOff ? (
        <div className="flex h-full items-center justify-center">
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-white/10 font-semibold text-white",
              compact ? "size-9 text-sm" : "size-16 text-xl sm:size-20 sm:text-2xl",
            )}
          >
            {initials(label)}
          </span>
        </div>
      ) : (
        <DailyVideo sessionId={id} automirror={local} fit="cover" className="h-full w-full" />
      )}
      {hand && (
        <span
          className={cn(
            "absolute top-2 left-2 rounded-lg bg-black/55 leading-none shadow",
            compact ? "px-1 py-0.5 text-base" : "px-1.5 py-1 text-2xl",
          )}
          role="img"
          aria-label="Hand raised"
        >
          ✋
        </span>
      )}
    </VideoTile>
  );
}
