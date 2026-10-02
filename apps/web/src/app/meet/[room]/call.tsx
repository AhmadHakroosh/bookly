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
  token,
  room,
  capture,
  encrypted = false,
  hostName,
  attendeeName,
}: {
  url: string;
  /** Daily meeting token naming the participant (and marking the host as owner), if known. */
  token?: string | null;
  room: string;
  capture: boolean;
  /** The room is peer-to-peer: the banner reports whether media really is going direct. */
  encrypted?: boolean;
  hostName: string;
  attendeeName: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  /** The last few transcribed lines, shown under the call while capture is on. */
  const [captions, setCaptions] = useState<{ t: number; speaker: string; text: string }[]>([]);
  /** Media path Daily reports for this call; only meaningful on encrypted rooms. */
  const [topology, setTopology] = useState<"peer-to-peer" | "sfu" | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const call: DailyCall = DailyIframe.createFrame(container.current, {
      url,
      ...(token ? { token } : {}),
      showLeaveButton: true,
      // Absolute inside the relative container: fills it whatever the flex layout decides,
      // instead of the iframe's default 150px when a percentage height cannot resolve.
      iframeStyle: {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        border: "0",
      },
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
    if (encrypted) {
      call.on("network-connection", (ev) => {
        if (ev.type === "peer-to-peer" || ev.type === "sfu") setTopology(ev.type);
      });
      call.on("left-meeting", () => setTopology(null));
    }
    void call.join();
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      flush();
      void call.destroy();
    };
  }, [url, token, room, capture, encrypted, hostName, attendeeName]);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {encrypted && (
        <p
          className={`px-4 py-1.5 text-center text-xs ${topology === "sfu" ? "bg-red-500/20 text-red-200" : "bg-emerald-500/15 text-emerald-200"}`}
          role="status"
        >
          {topology === "peer-to-peer"
            ? "End-to-end encrypted: audio and video go directly between the two of you and are never transcribed."
            : topology === "sfu"
              ? "Not peer-to-peer right now: audio and video are being relayed through Daily's servers."
              : "End-to-end encrypted call: audio and video go directly between the two of you once connected."}
        </p>
      )}
      <div ref={container} className="relative min-h-0 w-full flex-1" />
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
