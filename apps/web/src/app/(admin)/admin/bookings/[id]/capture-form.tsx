"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { captureNotes, sendFollowUpAction, type CaptureState } from "../../scheduling-actions";

export function CaptureForm({
  bookingId,
  assistant,
  draft,
  transcript,
}: {
  bookingId: string;
  assistant: boolean;
  draft: { subject: string; body: string } | null;
  /** Ready transcript text, offered as the source for capture. */
  transcript?: string | null;
}) {
  const [state, action, pending] = useActionState(captureNotes, {} as CaptureState);
  const [notes, setNotes] = useState("");
  const [clearedFor, setClearedFor] = useState<CaptureState | null>(null);
  if (state.ok && clearedFor !== state) {
    setClearedFor(state);
    setNotes("");
  }
  const followUp = state.followUp ?? draft;
  const [subject, setSubject] = useState(followUp?.subject ?? "");
  const [body, setBody] = useState(followUp?.body ?? "");
  const [seeded, setSeeded] = useState<string | null>(null);
  if (followUp && seeded !== followUp.subject + followUp.body) {
    setSeeded(followUp.subject + followUp.body);
    setSubject(followUp.subject);
    setBody(followUp.body);
  }
  return (
    <div className="space-y-4">
      <form action={action} className="rounded-xl border p-4">
        <input type="hidden" name="id" value={bookingId} />
        <h2 className="text-base font-semibold tracking-tight">After the meeting</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {assistant
            ? "Paste your notes or a transcript. The assistant extracts decisions, action items with dates, a next step and drafts the follow-up."
            : 'Write your notes. Lines starting with "- " become tasks. Set ANTHROPIC_API_KEY to have decisions, dates and a follow-up extracted for you.'}
        </p>
        {transcript && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setNotes(transcript)}
          >
            Use the transcript
          </Button>
        )}
        <textarea
          name="notes"
          rows={6}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            "Agreed to start with a 2-week discovery.\n- Send proposal by Friday\n- They share the API docs"
          }
          className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm"
        />
        {state.error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="mt-2 text-sm" role="status">
            Captured. Tasks and the timeline are updated below.
          </p>
        )}
        <Button type="submit" size="sm" className="mt-3" disabled={pending}>
          {pending ? "Working…" : "Capture"}
        </Button>
      </form>
      <form action={sendFollowUpAction.bind(null, bookingId)} className="rounded-xl border p-4">
        <h2 className="text-base font-semibold tracking-tight">Follow-up email</h2>
        <input
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="mt-2 h-9 w-full rounded-lg border bg-background px-3 text-sm"
        />
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          placeholder="Thanks for your time today…"
          className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Sent from Bookly with your address as reply-to; your name is added as the sign-off.
        </p>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={!subject.trim() || !body.trim()}
        >
          Send follow-up
        </Button>
      </form>
    </div>
  );
}
