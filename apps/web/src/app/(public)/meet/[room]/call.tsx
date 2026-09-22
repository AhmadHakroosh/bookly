"use client";

import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { useEffect, useRef, useState } from "react";

type Line = { t: number; speaker: string; text: string };

/**
 * Daily Prebuilt in a frame. When auto-capture is on, live transcription lines are labelled
 * with the speaker (host / attendee / name) and posted to Bookly in small batches.
 */
export function Call({
  url,
  room,
  capture,
  hostName,
  attendeeName,
}: {
  url: string;
  room: string;
  capture: boolean;
  hostName: string;
  attendeeName: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  /** The last few transcribed lines, shown under the call while capture is on. */
  const [captions, setCaptions] = useState<{ t: number; speaker: string; text: string }[]>([]);
  useEffect(() => {
    if (!container.current) return;
    const call: DailyCall = DailyIframe.createFrame(container.current, {
      url,
      showLeaveButton: true,
      iframeStyle: { width: "100%", height: "100%", border: "0" },
    });
    let queue: Line[] = [];
    let startedAt: number | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const flush = () => {
      if (!queue.length) return;
      const batch = queue;
      queue = [];
      void fetch(`/api/meet/${room}/transcript`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ segments: batch }),
        keepalive: true,
      }).catch(() => {});
    };
    if (capture) {
      const labelFor = (participantId: string) => {
        const p = Object.values(call.participants()).find((x) => x.session_id === participantId);
        const name = (p?.user_name ?? "").trim();
        if (!name) return p?.local ? "attendee" : "unknown";
        if (name.toLowerCase() === hostName.toLowerCase()) return "host";
        if (name.toLowerCase() === attendeeName.toLowerCase()) return "attendee";
        return name;
      };
      call.on("transcription-started", () => {
        startedAt = Date.now();
      });
      call.on("transcription-message", (ev) => {
        if (!ev.text?.trim()) return;
        const at = ev.timestamp ? new Date(ev.timestamp).getTime() : Date.now();
        if (startedAt === null) startedAt = at;
        const line = {
          t: Math.max(0, (at - startedAt) / 1000),
          speaker: labelFor(ev.participantId),
          text: ev.text,
        };
        queue.push(line);
        setCaptions((prev) => [...prev, line].slice(-6));
        if (queue.length >= 10) flush();
      });
      timer = setInterval(flush, 5000);
      window.addEventListener("pagehide", flush);
    }
    void call.join();
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      flush();
      void call.destroy();
    };
  }, [url, room, capture, hostName, attendeeName]);
  return (
    <div className="flex w-full flex-1 flex-col">
      <div ref={container} className="w-full flex-1" />
      {capture && (
        <div
          className="border-t border-white/10 bg-neutral-950 px-4 py-2 font-mono text-xs text-white/85"
          aria-live="polite"
          aria-label="Live transcript"
        >
          {captions.length === 0 ? (
            <p className="text-white/50">Live transcript: lines appear here as people speak.</p>
          ) : (
            <ol className="space-y-0.5">
              {captions.map((c, i) => (
                <li key={`${c.t}-${i}`}>
                  <span className="text-white/40">[{formatClock(c.t)}]</span>{" "}
                  <span className="text-amber-300">{c.speaker}:</span> {c.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
