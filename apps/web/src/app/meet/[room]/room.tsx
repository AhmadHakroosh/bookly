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
import { MicOffIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { gridColumns, messageId, parseCallMessage, tileWidth, type CallMessage } from "./messages";
import { initials } from "./messages";
import { ChatPanel, PeoplePanel, ReactionsOverlay, type Reaction } from "./panels";
import { Tray, type Panel } from "./tray";

/** The call itself: stage (tiles or screen share), side panel, tray, remote audio. */
export function Room({ hostName, onLeave }: { hostName: string; onLeave: () => void }) {
  const call = useDaily();
  const localId = useLocalSessionId();
  const localName = useParticipantProperty(localId, "user_name");
  const isOwner = useParticipantProperty(localId, "owner") === true;
  const [panel, setPanel] = useState<Panel>(null);
  // Read by the app-message handler (an event callback) to count unread chat lines.
  const panelRef = useRef<Panel>(null);
  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);
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
          if (panelRef.current !== "chat") setUnread((u) => u + 1);
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
  const openPanel = (p: Panel) => {
    setPanel((cur) => (cur === p ? null : p));
    if (p === "chat") setUnread(0);
  };

  // Knocking: the host sees who is waiting and can let them in from the banner or People.
  const { waitingParticipants, grantAccess, denyAccess } = useWaitingParticipants();
  const waiting = isOwner ? waitingParticipants : [];

  // Keyboard: ⌘/Ctrl+D mic, ⌘/Ctrl+E camera (the same as the common conferencing apps).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !call) return;
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
  }, [call]);

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
            className="flex flex-wrap items-center justify-center gap-2 border-b bg-brand/15 px-4 py-2 text-sm"
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
          <p className="bg-amber-500/15 px-4 py-1 text-center text-xs text-amber-200" role="status">
            This room closes in {minutesLeft} minute{minutesLeft === 1 ? "" : "s"}.
          </p>
        )}
        <div className="relative flex min-h-0 flex-1">
          <div ref={stageRef} className="relative min-h-0 min-w-0 flex-1">
            <Stage localId={localId} hostName={hostName} />
            <ReactionsOverlay items={reactions} />
          </div>
          {panel && (
            <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l bg-background md:static md:w-80">
              {panel === "chat" ? (
                <ChatPanel messages={messages} onSend={sendChat} onClose={() => setPanel(null)} />
              ) : (
                <PeoplePanel
                  localId={localId}
                  isOwner={isOwner}
                  waiting={waiting}
                  onAdmit={grantAccess}
                  onDeny={denyAccess}
                  onClose={() => setPanel(null)}
                />
              )}
            </aside>
          )}
        </div>
        <Tray
          panel={panel}
          onPanel={openPanel}
          unread={unread}
          waitingCount={waiting.length}
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
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
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
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl bg-muted",
        speaking && "ring-2 ring-brand",
      )}
    >
      {video.isOff ? (
        <div className="flex h-full items-center justify-center">
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-brand/20 font-semibold text-brand",
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
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-xs text-white">
        <span className="truncate font-medium">
          {label}
          {local ? " (You)" : ""}
        </span>
        {isHost && !compact && (
          <span className="rounded bg-white/20 px-1 py-px text-[10px] tracking-wide uppercase">
            Host
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {audio.isOff && <MicOffIcon className="size-3.5 text-red-300" aria-label="Muted" />}
        </span>
      </div>
    </div>
  );
}
