"use client";

import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { useEffect, useRef } from "react";

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
        queue.push({
          t: Math.max(0, (at - startedAt) / 1000),
          speaker: labelFor(ev.participantId),
          text: ev.text,
        });
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
  return <div ref={container} className="w-full flex-1" />;
}
