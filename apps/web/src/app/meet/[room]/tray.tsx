"use client";

import DailyIframe from "@daily-co/daily-js";
import {
  useAudioTrack,
  useDaily,
  useDevices,
  useInputSettings,
  useLocalSessionId,
  useNetwork,
  useParticipantProperty,
  useScreenShare,
  useVideoTrack,
} from "@daily-co/daily-react";
import {
  EllipsisIcon,
  FlagIcon,
  HandIcon,
  MaximizeIcon,
  MicIcon,
  MicOffIcon,
  MinimizeIcon,
  MonitorUpIcon,
  PanelRightIcon,
  PhoneOffIcon,
  PictureInPicture2Icon,
  SmilePlusIcon,
  SparklesIcon,
  VideoIcon,
  VideoOffIcon,
  WifiIcon,
  WifiLowIcon,
  WifiZeroIcon,
} from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { CallControl, CallControls } from "@/components/ui/call-controls";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EffectsPopover, rememberNoiseCancellation } from "./effects";
import { REACTIONS } from "./messages";

export type Panel = "notes" | "transcript" | "chat" | "people";

/**
 * The control bar as `mocks.png` 04 draws it: Mute, Stop video, Share, then the rest (hand,
 * reactions, the side panel, More for devices, effects and the window) as labelled round
 * buttons, and Leave on its own in red. Keyboard: ⌘/Ctrl+D mic, ⌘/Ctrl+E camera.
 */
export function Tray({
  panelOpen,
  onTogglePanel,
  unread,
  waitingCount,
  notes,
  onReaction,
  onLeave,
  stageRef,
}: {
  panelOpen: boolean;
  onTogglePanel: () => void;
  /** Chat lines and knocks the member has not seen; shown on the panel button. */
  unread: number;
  waitingCount: number;
  /** The member's in-meeting notes are on: Mark moment in More. */
  notes: { onMark: () => void } | null;
  onReaction: (emoji: string) => void;
  onLeave: () => void;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const call = useDaily();
  const localId = useLocalSessionId();
  const video = useVideoTrack(localId);
  const audio = useAudioTrack(localId);
  const userData = useParticipantProperty(localId, "userData") as { hand?: boolean } | null;
  const hand = userData?.hand === true;
  const { isSharingScreen, startScreenShare, stopScreenShare } = useScreenShare();
  const devices = useDevices();
  const { inputSettings, updateInputSettings } = useInputSettings();
  const { threshold } = useNetwork();
  const [fullscreen, setFullscreen] = useState(false);
  const [effects, setEffects] = useState(false);
  const [support] = useState(() => DailyIframe.supportedBrowser());
  const noise = inputSettings?.audio?.processor?.type === "noise-cancellation";
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const canPip = typeof document !== "undefined" && "pictureInPictureEnabled" in document;

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleHand = () => void call?.setUserData({ ...(userData ?? {}), hand: !hand });
  const share = () => (isSharingScreen ? stopScreenShare() : startScreenShare());
  const togglePip = async () => {
    const el = stageRef.current?.querySelector("video");
    if (!el) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await el.requestPictureInPicture();
    } catch {
      /* unsupported or blocked */
    }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* unsupported */
    }
  };
  const NetIcon =
    threshold === "very-low" ? WifiZeroIcon : threshold === "low" ? WifiLowIcon : WifiIcon;

  return (
    <div className="border-t bg-card px-2 pt-2 pb-1 sm:px-4">
      <CallControls className="mx-auto max-w-5xl [scrollbar-width:none] overflow-x-auto">
        <CallControl
          icon={audio.isOff ? MicOffIcon : MicIcon}
          label={audio.isOff ? "Unmute" : "Mute"}
          title={audio.isOff ? "Unmute (⌘D)" : "Mute (⌘D)"}
          tone={audio.isOff ? "alert" : "default"}
          aria-pressed={audio.isOff}
          onClick={() => call?.setLocalAudio(audio.isOff)}
        />
        <CallControl
          icon={video.isOff ? VideoOffIcon : VideoIcon}
          label={video.isOff ? "Start video" : "Stop video"}
          title={video.isOff ? "Start video (⌘E)" : "Stop video (⌘E)"}
          tone={video.isOff ? "alert" : "default"}
          aria-pressed={video.isOff}
          onClick={() => call?.setLocalVideo(video.isOff)}
        />
        {/* Share and Raise hand sit in More on a phone, where the bar has room for five. */}
        {canShare && (
          <CallControl
            icon={MonitorUpIcon}
            label={isSharingScreen ? "Stop share" : "Share"}
            pressed={isSharingScreen}
            className="hidden sm:flex"
            onClick={share}
          />
        )}
        <CallControl
          icon={HandIcon}
          label={hand ? "Lower hand" : "Raise hand"}
          pressed={hand}
          className="hidden sm:flex"
          onClick={toggleHand}
        />
        <Popover>
          <PopoverTrigger render={<CallControl icon={SmilePlusIcon} label="React" />} />
          <PopoverContent className="flex w-auto flex-row gap-1 p-1.5" align="center">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="rounded-md px-2 py-1 text-xl transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`React ${emoji}`}
                onClick={() => onReaction(emoji)}
              >
                {emoji}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <CallControl
          icon={PanelRightIcon}
          label={panelOpen ? "Hide panel" : "Panel"}
          pressed={panelOpen}
          badge={panelOpen ? 0 : unread + waitingCount}
          onClick={onTogglePanel}
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={<CallControl icon={EllipsisIcon} label="More" />} />
          <DropdownMenuContent align="end" side="top" className="w-72">
            <DropdownMenuGroup className="sm:hidden">
              {canShare && (
                <DropdownMenuItem onClick={share}>
                  <MonitorUpIcon />
                  {isSharingScreen ? "Stop sharing" : "Share screen"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggleHand}>
                <HandIcon />
                {hand ? "Lower hand" : "Raise hand"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
            {notes && (
              <>
                <DropdownMenuItem onClick={notes.onMark}>
                  <FlagIcon />
                  Mark moment
                  <DropdownMenuShortcut>⌘⇧M</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {support.supportsVideoProcessing && (
              <DropdownMenuItem onClick={() => setEffects(true)}>
                <SparklesIcon />
                Background effects
              </DropdownMenuItem>
            )}
            {canPip && (
              <DropdownMenuItem onClick={() => void togglePip()}>
                <PictureInPicture2Icon />
                Picture in picture
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => void toggleFullscreen()}>
              {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
              {fullscreen ? "Exit full screen" : "Full screen"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DeviceGroup
              label="Camera"
              devices={devices.cameras}
              current={devices.currentCam?.device.deviceId}
              onPick={(id) => void devices.setCamera(id)}
            />
            <DropdownMenuSeparator />
            <DeviceGroup
              label="Microphone"
              devices={devices.microphones}
              current={devices.currentMic?.device.deviceId}
              onPick={(id) => void devices.setMicrophone(id)}
            />
            {devices.speakers.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DeviceGroup
                  label="Speaker"
                  devices={devices.speakers}
                  current={devices.currentSpeaker?.device.deviceId}
                  onPick={(id) => void devices.setSpeaker(id)}
                />
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuCheckboxItem
                checked={noise}
                disabled={!support.supportsAudioProcessing}
                onCheckedChange={(on) => {
                  rememberNoiseCancellation(on);
                  void updateInputSettings({
                    audio: { processor: { type: on ? "noise-cancellation" : "none" } },
                  });
                }}
              >
                Cancel background noise
              </DropdownMenuCheckboxItem>
              <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
                <NetIcon className="size-3.5" />
                Connection:{" "}
                {threshold === "very-low" ? "poor" : threshold === "low" ? "fair" : "good"}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <CallControl icon={PhoneOffIcon} label="Leave" tone="end" onClick={onLeave} />
      </CallControls>
      <Dialog open={effects} onOpenChange={setEffects}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Background effects</DialogTitle>
          </DialogHeader>
          <EffectsPopover />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeviceGroup({
  label,
  devices,
  current,
  onPick,
}: {
  label: string;
  devices: { device: MediaDeviceInfo }[];
  current: string | undefined;
  onPick: (id: string) => void;
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={current ?? ""} onValueChange={(v) => onPick(String(v))}>
        {devices.length === 0 && (
          <DropdownMenuRadioItem value="" disabled>
            No {label.toLowerCase()} found
          </DropdownMenuRadioItem>
        )}
        {devices.map((d) => (
          <DropdownMenuRadioItem key={d.device.deviceId} value={d.device.deviceId}>
            <span className="truncate">{d.device.label || label}</span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
