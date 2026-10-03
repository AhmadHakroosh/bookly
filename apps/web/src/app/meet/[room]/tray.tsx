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
  HandIcon,
  MaximizeIcon,
  MessageSquareIcon,
  MicIcon,
  MicOffIcon,
  MinimizeIcon,
  MonitorUpIcon,
  PhoneOffIcon,
  PictureInPicture2Icon,
  SettingsIcon,
  SmilePlusIcon,
  SparklesIcon,
  UsersIcon,
  VideoIcon,
  VideoOffIcon,
  WifiIcon,
  WifiLowIcon,
  WifiZeroIcon,
} from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EffectsPopover, rememberNoiseCancellation } from "./effects";
import { REACTIONS } from "./messages";

export type Panel = "chat" | "people" | null;

/** The control bar: media toggles, share, hand, reactions, panels, settings, leave. */
export function Tray({
  panel,
  onPanel,
  unread,
  waitingCount,
  onReaction,
  onLeave,
  stageRef,
}: {
  panel: Panel;
  onPanel: (p: Panel) => void;
  unread: number;
  waitingCount: number;
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
    <div className="flex flex-wrap items-center justify-center gap-1.5 border-t bg-card px-2 py-2 sm:gap-2">
      <TrayButton
        label={audio.isOff ? "Unmute (⌘D)" : "Mute (⌘D)"}
        active={!audio.isOff}
        danger={audio.isOff}
        onClick={() => call?.setLocalAudio(audio.isOff)}
      >
        {audio.isOff ? <MicOffIcon /> : <MicIcon />}
      </TrayButton>
      <TrayButton
        label={video.isOff ? "Camera on (⌘E)" : "Camera off (⌘E)"}
        active={!video.isOff}
        danger={video.isOff}
        onClick={() => call?.setLocalVideo(video.isOff)}
      >
        {video.isOff ? <VideoOffIcon /> : <VideoIcon />}
      </TrayButton>
      {canShare && (
        <TrayButton
          label={isSharingScreen ? "Stop sharing" : "Share screen"}
          active={isSharingScreen}
          highlight={isSharingScreen}
          onClick={() => (isSharingScreen ? stopScreenShare() : startScreenShare())}
        >
          <MonitorUpIcon />
        </TrayButton>
      )}
      <TrayButton
        label={hand ? "Lower hand" : "Raise hand"}
        active={hand}
        highlight={hand}
        onClick={toggleHand}
      >
        <HandIcon />
      </TrayButton>
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={<Button variant="outline" size="icon-lg" aria-label="Send a reaction" />}
              />
            }
          >
            <SmilePlusIcon />
          </TooltipTrigger>
          <TooltipContent>React</TooltipContent>
        </Tooltip>
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
      {support.supportsVideoProcessing && (
        <Popover>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button variant="outline" size="icon-lg" aria-label="Background effects" />
                  }
                />
              }
            >
              <SparklesIcon />
            </TooltipTrigger>
            <TooltipContent>Background effects</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-80 p-3" align="center">
            <EffectsPopover />
          </PopoverContent>
        </Popover>
      )}
      <TrayButton
        label="Chat"
        active={panel === "chat"}
        highlight={panel === "chat"}
        onClick={() => onPanel("chat")}
        badge={unread}
      >
        <MessageSquareIcon />
      </TrayButton>
      <TrayButton
        label="People"
        active={panel === "people"}
        highlight={panel === "people"}
        onClick={() => onPanel("people")}
        badge={waitingCount}
      >
        <UsersIcon />
      </TrayButton>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={<Button variant="outline" size="icon-lg" aria-label="Settings" />}
              />
            }
          >
            <SettingsIcon />
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-72">
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
            <DropdownMenuLabel>Audio</DropdownMenuLabel>
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
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
              <NetIcon className="size-3.5" />
              Connection:{" "}
              {threshold === "very-low" ? "poor" : threshold === "low" ? "fair" : "good"}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {canPip && (
        <TrayButton label="Picture in picture" onClick={() => void togglePip()}>
          <PictureInPicture2Icon />
        </TrayButton>
      )}
      <TrayButton
        label={fullscreen ? "Exit full screen" : "Full screen"}
        onClick={() => void toggleFullscreen()}
      >
        {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
      </TrayButton>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="destructive"
              size="lg"
              aria-label="Leave call"
              onClick={onLeave}
              className="ml-1 bg-red-600 text-white hover:bg-red-700 sm:ml-3"
            />
          }
        >
          <PhoneOffIcon />
          <span className="hidden sm:inline">Leave</span>
        </TooltipTrigger>
        <TooltipContent>Leave the call</TooltipContent>
      </Tooltip>
    </div>
  );
}

function TrayButton({
  label,
  active,
  danger = false,
  highlight = false,
  badge = 0,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  highlight?: boolean;
  badge?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={danger ? "destructive" : "outline"}
            size="icon-lg"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
              "relative",
              highlight && "border-brand bg-brand/15 text-brand hover:bg-brand/25",
            )}
          />
        }
      >
        {children}
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
