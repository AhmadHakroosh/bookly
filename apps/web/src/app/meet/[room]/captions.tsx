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
        setCaptions((prev) => [...prev, line].slice(-6));
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

/**
 * The last few transcribed lines, shown under the call while capture is on. Lines are stored
 * with the role ("host" / "attendee") so recaps can tell the sides apart; on screen they carry
 * the person's name, with "(host)" after the host's.
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
  const label = (speaker: string) =>
    speaker === "host"
      ? `${hostName || "Host"} (host)`
      : speaker === "attendee"
        ? attendeeName || "Attendee"
        : speaker;
  return (
    <div
      className="border-t bg-card px-4 py-2 font-mono text-xs text-foreground/85"
      aria-live="polite"
      aria-label="Live transcript"
    >
      {lines.length === 0 ? (
        <p className="text-muted-foreground">Live transcript: lines appear here as people speak.</p>
      ) : (
        <ol className="space-y-0.5">
          {lines.map((c, i) => (
            <li key={`${c.t}-${i}`}>
              <span className="text-muted-foreground">[{formatClock(c.t)}]</span>{" "}
              <span className="text-brand">{label(c.speaker)}:</span> {c.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
