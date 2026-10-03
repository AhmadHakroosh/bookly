"use client";

import {
  DailyProvider,
  useCallObject,
  useDaily,
  useDailyEvent,
  useNetwork,
} from "@daily-co/daily-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Captions, useLiveTranscript } from "./captions";
import { applySavedEffect, noiseCancellationWanted } from "./effects";
import { Prejoin } from "./prejoin";
import { Room } from "./room";

export type CallProps = {
  /** Daily room URL. */
  url: string;
  /** Daily meeting token naming the participant (and marking the host as owner), if known. */
  token?: string | null;
  room: string;
  /** Auto-capture is on: live lines are posted to Bookly and a notice is shown. */
  capture: boolean;
  /** Peer-to-peer room: the page asks Daily for the peer topology and reports what it got. */
  encrypted?: boolean;
  hostName: string;
  attendeeName: string;
  /** Name to pre-fill: the host's or the booked attendee's; empty for anyone else. */
  initialName: string;
  /** No token: the visitor types a name and knocks. */
  needsName: boolean;
};

/**
 * Bookly video: Bookly's own call UI on Daily's call object (no Prebuilt). The call object is
 * created once per page; the UI moves through prejoin → (knocking) → in call → left.
 */
export function Call(props: CallProps) {
  const callObject = useCallObject({
    options: {
      url: props.url,
      ...(props.token ? { token: props.token } : {}),
      // Load Daily's call-machine bundle as a script rather than through eval(), so the CSP can
      // stay without 'unsafe-eval' (see next.config.ts).
      dailyConfig: { avoidEval: true },
    },
  });
  if (!callObject)
    return (
      <div className="flex flex-1 items-center justify-center" aria-busy aria-label="Loading">
        <Spinner />
      </div>
    );
  return (
    <DailyProvider callObject={callObject}>
      <CallUi {...props} />
    </DailyProvider>
  );
}

type Stage = "prejoin" | "joining" | "knocking" | "in" | "denied" | "left" | "error";

function CallUi(props: CallProps) {
  const call = useDaily();
  const [stage, setStage] = useState<Stage>("prejoin");
  const [name, setName] = useState(props.initialName);
  const [error, setError] = useState<string | null>(null);
  const [lastMedia, setLastMedia] = useState({ cam: true, mic: true });
  const { topology } = useNetwork();
  const captions = useLiveTranscript({
    room: props.room,
    capture: props.capture,
    hostName: props.hostName,
    attendeeName: props.attendeeName,
  });

  useDailyEvent(
    "joined-meeting",
    useCallback(() => {
      if (!call) return;
      // Daily's room-level `sfu_switchover` is not honoured on mesh-SFU domains, so the page asks
      // for the peer topology itself; one side asking switches both participants.
      if (props.encrypted)
        void call
          .setNetworkTopology({ topology: "peer" })
          .then((r) => {
            if (r?.error) console.warn("[meet] peer topology", r.error);
          })
          .catch((e) => console.warn("[meet] peer topology", e));
      // Noise cancellation is on unless the person switched it off before; the background effect
      // they chose last time comes back too. Both are best effort (browser support varies).
      if (noiseCancellationWanted())
        void call
          .updateInputSettings({ audio: { processor: { type: "noise-cancellation" } } })
          .catch(() => {});
      void applySavedEffect(call);
      const access = call.accessState().access;
      if (access !== "unknown" && access.level === "lobby") {
        setStage("knocking");
        call
          .requestAccess({ name: name || "Guest", access: { level: "full" } })
          .then(({ granted }) => setStage(granted ? "in" : "denied"))
          .catch(() => setStage("denied"));
      } else setStage("in");
    }, [call, name, props.encrypted]),
  );
  useDailyEvent(
    "left-meeting",
    useCallback(() => setStage((s) => (s === "denied" || s === "error" ? s : "left")), []),
  );
  useDailyEvent(
    "error",
    useCallback((ev) => {
      setError(ev.errorMsg || "The call could not be joined.");
      setStage("error");
    }, []),
  );

  const join = async (media: { cam: boolean; mic: boolean }) => {
    if (!call) return;
    setLastMedia(media);
    setStage("joining");
    try {
      await call.join({
        userName: name.trim() || "Guest",
        startVideoOff: !media.cam,
        startAudioOff: !media.mic,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  };

  if (stage === "prejoin")
    return (
      <Prejoin
        name={name}
        setName={setName}
        needsName={props.needsName}
        hostName={props.hostName}
        onJoin={join}
      />
    );
  if (stage === "joining" || stage === "knocking")
    return (
      <Notice
        title={stage === "joining" ? "Joining…" : "Waiting for the host"}
        body={
          stage === "joining"
            ? "Connecting you to the room."
            : "The host has been asked to let you in. Keep this page open."
        }
        spinner
        action={
          stage === "knocking" ? (
            <Button variant="outline" onClick={() => void call?.leave()}>
              Cancel request
            </Button>
          ) : null
        }
      />
    );
  if (stage === "denied")
    return (
      <Notice
        title="Not let in"
        body="The host did not admit you to this call. If you believe this is a mistake, contact them directly."
        action={<Button onClick={() => setStage("prejoin")}>Try again</Button>}
      />
    );
  if (stage === "error")
    return (
      <Notice
        title="Something went wrong"
        body={error ?? "The call could not be joined."}
        action={<Button onClick={() => setStage("prejoin")}>Back</Button>}
      />
    );
  if (stage === "left")
    return (
      <Notice
        title="You left the call"
        body="Thanks for meeting on Bookly. You can close this page or rejoin."
        action={<Button onClick={() => void join(lastMedia)}>Rejoin</Button>}
      />
    );
  return (
    <>
      {props.encrypted && (
        <p
          className={`px-4 py-1.5 text-center text-xs ${
            topology === "peer"
              ? "bg-emerald-500/15 text-emerald-200"
              : topology === "sfu"
                ? "bg-red-500/20 text-red-200"
                : "bg-muted text-muted-foreground"
          }`}
          role="status"
        >
          {topology === "peer"
            ? "End-to-end encrypted: audio and video go directly between the two of you and are never transcribed."
            : topology === "sfu"
              ? "Not peer-to-peer right now: audio and video are being relayed through Daily's servers."
              : "End-to-end encrypted call: audio and video go directly between the two of you once connected."}
        </p>
      )}
      <Room hostName={props.hostName} onLeave={() => void call?.leave()} />
      {props.capture && (
        <Captions lines={captions} hostName={props.hostName} attendeeName={props.attendeeName} />
      )}
    </>
  );
}

function Notice({
  title,
  body,
  action,
  spinner = false,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  spinner?: boolean;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
        {spinner && (
          <div className="mb-3 flex justify-center">
            <Spinner />
          </div>
        )}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
