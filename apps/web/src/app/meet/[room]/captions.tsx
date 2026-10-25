"use client";

import { useDaily, useDailyEvent } from "@daily-co/daily-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectedLang, formatClock } from "./messages";

export type Line = { t: number; speaker: string; text: string; lang?: string };

/**
 * When auto-capture is on, Daily's live transcription lines are labelled with the speaker
 * (host / attendee / name) and posted to Bookly in small batches, so the transcript carries
 * speakers and the language each line was spoken in.
 */
export function useLiveTranscript({
  room,
  capture,
  hostName,
  attendeeName,
}: {
  room: string;
  capture: boolean;
  hostName: string;
  attendeeName: string;
}) {
  const call = useDaily();
  const [captions, setCaptions] = useState<Line[]>([]);
  const queue = useRef<Line[]>([]);
  const startedAt = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (!queue.current.length) return;
    const batch = queue.current;
    queue.current = [];
    void fetch(`/api/meet/${room}/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ segments: batch }),
      keepalive: true,
    }).catch(() => {});
  }, [room]);

  useDailyEvent(
    "transcription-started",
    useCallback(() => {
      startedAt.current = Date.now();
    }, []),
  );

  useDailyEvent(
    "transcription-message",
    useCallback(
      (ev) => {
        if (!capture || !call || !ev.text?.trim()) return;
        const p = Object.values(call.participants()).find((x) => x.session_id === ev.participantId);
        const name = (p?.user_name ?? "").trim();
        const speaker = !name
          ? p?.local
            ? "attendee"
            : "unknown"
          : name.toLowerCase() === hostName.toLowerCase()
            ? "host"
            : name.toLowerCase() === attendeeName.toLowerCase()
              ? "attendee"
              : name;
        const at = ev.timestamp ? new Date(ev.timestamp).getTime() : Date.now();
        if (startedAt.current === null) startedAt.current = at;
        const lang = detectedLang(ev.rawResponse);
        const line: Line = {
          t: Math.max(0, (at - startedAt.current) / 1000),
          speaker,
          text: ev.text,
          ...(lang ? { lang } : {}),
        };
        queue.current.push(line);
        setCaptions((prev) => [...prev, line].slice(-500));
        if (queue.current.length >= 10) flush();
      },
      [attendeeName, call, capture, flush, hostName],
    ),
  );

  useEffect(() => {
    if (!capture) return;
    const timer = setInterval(flush, 5000);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [capture, flush]);

  return captions;
}

const speakerLabel = (speaker: string, hostName: string, attendeeName: string) =>
  speaker === "host"
    ? `${hostName || "Host"} (host)`
    : speaker === "attendee"
      ? attendeeName || "Attendee"
      : speaker;

/**
 * The last few transcribed lines under the stage while the side panel's Transcript tab is not in
 * view. Lines are stored with the role ("host" / "attendee") so recaps can tell the sides apart;
 * on screen they carry the person's name, with "(host)" after the host's.
 */
export function Captions({
  lines,
  hostName,
  attendeeName,
}: {
  lines: Line[];
  hostName: string;
  attendeeName: string;
}) {
  return (
    <div
      className="border-t bg-card px-4 py-2 text-xs text-foreground/85"
      aria-live="polite"
      aria-label="Live transcript"
    >
      {lines.length === 0 ? (
        <p className="text-muted-foreground">Live transcript: lines appear here as people speak.</p>
      ) : (
        <ol className="space-y-0.5">
          {lines.map((c, i) => (
            <li key={`${c.t}-${i}`}>
              <span className="font-mono text-muted-foreground">[{formatClock(c.t)}]</span>{" "}
              <span className="font-medium text-primary">
                {speakerLabel(c.speaker, hostName, attendeeName)}:
              </span>{" "}
              {c.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The side panel's Transcript tab: everything said so far, newest at the bottom. */
export function TranscriptPanel({
  lines,
  hostName,
  attendeeName,
}: {
  lines: Line[];
  hostName: string;
  attendeeName: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines.length]);
  return (
    <>
      <p className="border-b px-4 py-2 text-[11px] text-muted-foreground">
        This call is transcribed so both sides get notes and action items; the recap is written from
        it when the call ends.
      </p>
      <ol
        ref={list}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
        aria-live="polite"
      >
        {lines.length === 0 && (
          <li className="text-muted-foreground">Lines appear here as people speak.</li>
        )}
        {lines.map((c, i) => (
          <li key={`${c.t}-${i}`}>
            <p className="flex items-baseline gap-2">
              <span className="font-medium">{speakerLabel(c.speaker, hostName, attendeeName)}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatClock(c.t)}
              </span>
            </p>
            <p className="break-words">{c.text}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
