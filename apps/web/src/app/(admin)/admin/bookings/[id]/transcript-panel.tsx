import type { MeetingTranscript } from "@bookly/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/time";
import { renderTranscript, transcriptWords } from "@/server/transcript-text";
import { deleteTranscriptAction } from "../../scheduling-actions";

const LABEL: Record<string, string> = {
  pending: "Waiting for the call",
  recording: "Transcribing",
  ready: "Ready",
  failed: "Failed",
  deleted: "Deleted",
};

/** Auto-capture status and the transcript itself, with a delete control. Server component. */
export function TranscriptPanel({
  bookingId,
  status,
  consent,
  mode,
  transcript,
  names,
  tz,
}: {
  bookingId: string;
  status: string | null;
  consent: boolean | null;
  mode: "off" | "ask" | "always";
  transcript: MeetingTranscript | null;
  names: { host: string; attendee: string };
  tz: string;
}) {
  const effective = status ?? (mode === "ask" && consent !== true ? "declined" : "pending");
  return (
    <section className="rounded-xl border p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">Auto-capture</h2>
        <Badge variant={effective === "ready" ? "default" : "secondary"}>
          {effective === "declined" ? "Attendee declined" : (LABEL[effective] ?? effective)}
        </Badge>
      </div>
      {effective === "declined" && (
        <p className="mt-2 text-muted-foreground">
          The attendee did not opt in, so the call is not transcribed. You can still add notes
          below.
        </p>
      )}
      {effective === "pending" && (
        <p className="mt-2 text-muted-foreground">
          Transcription starts automatically once you and the attendee are both in the call.
        </p>
      )}
      {effective === "failed" && (
        <p className="mt-2 text-muted-foreground">
          Daily could not transcribe this call. Add your notes below instead.
        </p>
      )}
      {transcript && status === "ready" && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {transcript.segments.length} lines · about {transcriptWords(transcript.segments)} words
            · {transcript.source} ·
            {transcript.expiresAt
              ? ` deleted automatically on ${fmtDateTime(transcript.expiresAt, tz)}`
              : " kept until deleted"}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">Show transcript</summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
              {renderTranscript(transcript.segments, names)}
            </pre>
          </details>
          <form action={deleteTranscriptAction.bind(null, bookingId)} className="mt-3">
            <Button type="submit" size="sm" variant="ghost">
              Delete transcript
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
