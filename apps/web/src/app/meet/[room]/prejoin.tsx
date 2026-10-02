"use client";

import {
  DailyVideo,
  useDaily,
  useDevices,
  useLocalSessionId,
  useVideoTrack,
} from "@daily-co/daily-react";
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/dropdown";
import { initials } from "./messages";

/**
 * Before joining: camera preview, device choice, mute toggles and, for visitors without a
 * token, the name they will knock with.
 */
export function Prejoin({
  name,
  setName,
  needsName,
  hostName,
  onJoin,
}: {
  name: string;
  setName: (v: string) => void;
  needsName: boolean;
  hostName: string;
  onJoin: (media: { cam: boolean; mic: boolean }) => void;
}) {
  const call = useDaily();
  const localId = useLocalSessionId();
  const video = useVideoTrack(localId);
  const devices = useDevices();
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const blocked = devices.camState === "blocked" || devices.micState === "blocked";

  // Ask for devices once so the preview and the pickers populate.
  useEffect(() => {
    if (!call) return;
    void call.startCamera().catch(() => {});
  }, [call]);

  const toggleCam = () => {
    const next = !cam;
    setCam(next);
    call?.setLocalVideo(next);
  };
  const toggleMic = () => {
    const next = !mic;
    setMic(next);
    call?.setLocalAudio(next);
  };
  const canJoin = !needsName || name.trim().length > 0;
  const deviceOptions = (list: { device: MediaDeviceInfo }[], kind: string) =>
    list.length
      ? list.map((d) => ({ value: d.device.deviceId, label: d.device.label || kind }))
      : [{ value: "", label: `No ${kind.toLowerCase()} found`, disabled: true }];

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <form
        className="grid w-full max-w-4xl gap-6 md:grid-cols-[3fr_2fr]"
        onSubmit={(e) => {
          e.preventDefault();
          if (canJoin) onJoin({ cam, mic });
        }}
      >
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
          {video.isOff || !localId ? (
            <div className="flex h-full items-center justify-center">
              <span className="flex size-20 items-center justify-center rounded-full bg-brand/20 text-2xl font-semibold text-brand">
                {initials(name)}
              </span>
            </div>
          ) : (
            <DailyVideo sessionId={localId} automirror fit="cover" className="h-full w-full" />
          )}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/60 to-transparent p-3">
            <Button
              type="button"
              variant={mic ? "outline" : "destructive"}
              size="icon-lg"
              aria-label={mic ? "Mute microphone" : "Unmute microphone"}
              aria-pressed={!mic}
              onClick={toggleMic}
            >
              {mic ? <MicIcon /> : <MicOffIcon />}
            </Button>
            <Button
              type="button"
              variant={cam ? "outline" : "destructive"}
              size="icon-lg"
              aria-label={cam ? "Turn camera off" : "Turn camera on"}
              aria-pressed={!cam}
              onClick={toggleCam}
            >
              {cam ? <VideoIcon /> : <VideoOffIcon />}
            </Button>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Ready to join?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {needsName
                ? `This room is private: ${hostName || "the host"} will let you in.`
                : "Check your camera and microphone, then join."}
            </p>
          </div>
          {needsName && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Your name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How you will appear"
                maxLength={60}
                autoFocus
                required
              />
            </label>
          )}
          {blocked && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Your browser is blocking the camera or microphone. Allow them from the address bar, or
              join without them.
            </p>
          )}
          <div className="grid gap-2">
            <Dropdown
              ariaLabel="Camera"
              value={devices.currentCam?.device.deviceId ?? ""}
              options={deviceOptions(devices.cameras, "Camera")}
              onValueChange={(v) => void devices.setCamera(v)}
              placeholder="Camera"
            />
            <Dropdown
              ariaLabel="Microphone"
              value={devices.currentMic?.device.deviceId ?? ""}
              options={deviceOptions(devices.microphones, "Microphone")}
              onValueChange={(v) => void devices.setMicrophone(v)}
              placeholder="Microphone"
            />
            {devices.speakers.length > 0 && (
              <Dropdown
                ariaLabel="Speaker"
                value={devices.currentSpeaker?.device.deviceId ?? ""}
                options={deviceOptions(devices.speakers, "Speaker")}
                onValueChange={(v) => void devices.setSpeaker(v)}
                placeholder="Speaker"
              />
            )}
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={!canJoin}
            className="bg-brand text-white hover:bg-brand/90"
          >
            {needsName ? "Ask to join" : "Join call"}
          </Button>
        </div>
      </form>
    </div>
  );
}
