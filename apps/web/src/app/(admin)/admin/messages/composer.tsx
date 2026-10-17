"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { AttachFiles } from "@/components/drive/attach-files";
import { MentionTextarea, type MentionPerson } from "@/components/mention-textarea";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addNoteAction, postMessageAction, sendToGuestAction, type MessageResult } from "./actions";

/** Toasts the outcome and, after a success, clears the form for the next message. */
function useOutcome(state: MessageResult, ok: string, reset: () => void) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok) {
      toast.success(ok);
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per result
  }, [state]);
}

/**
 * The bottom of a guest's conversation: write to them (an email with the signed Reply-To, so
 * their answer comes back here) or leave an internal note for the team.
 */
export function GuestComposer({
  threadId,
  contactId,
  contactName,
  optedOut,
  repliesOn,
  canNote,
  teamPlan,
  people,
  filesOn,
}: {
  threadId: string;
  contactId: string;
  contactName: string;
  optedOut: boolean;
  repliesOn: boolean;
  canNote: boolean;
  teamPlan: string;
  people: MentionPerson[];
  /** Files are on (flag and plan): attach from the drive or upload. */
  filesOn: boolean;
}) {
  const [mode, setMode] = useState<"email" | "note">(optedOut && canNote ? "note" : "email");
  return (
    <section aria-label="Write" className="space-y-3 border-t pt-4">
      <div
        role="tablist"
        aria-label="Write"
        className="inline-flex rounded-lg border p-0.5 text-sm"
      >
        {(
          [
            ["email", `Email ${contactName}`],
            ["note", "Internal note"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className={cn(
              "rounded-md px-3 py-1",
              mode === k ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "email" ? (
        optedOut ? (
          <p className="text-sm text-muted-foreground">
            {contactName} unsubscribed from your emails.
          </p>
        ) : (
          <EmailForm
            key={threadId}
            threadId={threadId}
            contactId={contactId}
            repliesOn={repliesOn}
            filesOn={filesOn}
          />
        )
      ) : canNote ? (
        <NoteForm
          key={threadId}
          threadId={threadId}
          contactId={contactId}
          people={people}
          filesOn={filesOn}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Internal notes come with {teamPlan}.</p>
      )}
    </section>
  );
}

function EmailForm({
  threadId,
  contactId,
  repliesOn,
  filesOn,
}: {
  threadId: string;
  contactId: string;
  repliesOn: boolean;
  filesOn: boolean;
}) {
  const [state, action] = useActionState(
    sendToGuestAction.bind(null, threadId),
    {} as MessageResult,
  );
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [round, setRound] = useState(0);
  useOutcome(state, "Sent", () => {
    setBody("");
    setSubject("");
    setRound((r) => r + 1);
  });
  return (
    <form action={action} className="space-y-2">
      <Input
        name="subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        maxLength={200}
        aria-label="New subject (optional)"
        placeholder="New subject (optional: leave empty to answer the latest email)"
      />
      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={8000}
        aria-label="Your message"
        placeholder="Write your message"
      />
      {filesOn && <AttachFiles key={round} contactId={contactId} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {repliesOn
            ? "Sent as an email from you; their reply comes back here."
            : "Sent as an email from you; replies go to your own inbox (guest replies are off)."}
        </p>
        <SubmitButton pendingText="Sending…" disabled={!body.trim()}>
          Send email
        </SubmitButton>
      </div>
    </form>
  );
}

function NoteForm({
  threadId,
  contactId,
  people,
  filesOn,
}: {
  threadId: string;
  contactId: string;
  people: MentionPerson[];
  filesOn: boolean;
}) {
  const [state, action] = useActionState(addNoteAction.bind(null, threadId), {} as MessageResult);
  const [body, setBody] = useState("");
  const [round, setRound] = useState(0);
  useOutcome(state, "Note added", () => {
    setBody("");
    setRound((r) => r + 1);
  });
  return (
    <form action={action} className="space-y-2">
      <MentionTextarea
        id={`note-${threadId}`}
        name="body"
        value={body}
        onValueChange={setBody}
        people={people}
        rows={3}
        maxLength={8000}
        ariaLabel="Internal note"
        placeholder="Only your team sees notes. Type @ to mention a teammate."
      />
      {filesOn && <AttachFiles key={round} contactId={contactId} />}
      <div className="flex justify-end">
        <SubmitButton variant="outline" pendingText="Adding…" disabled={!body.trim()}>
          Add note
        </SubmitButton>
      </div>
    </form>
  );
}

/** The bottom of a team thread: a message to everyone in it, with @-mentions and files. */
export function TeamComposer({
  threadId,
  contactId,
  people,
  filesOn,
}: {
  threadId: string;
  contactId: string | null;
  people: MentionPerson[];
  filesOn: boolean;
}) {
  const [state, action] = useActionState(
    postMessageAction.bind(null, threadId),
    {} as MessageResult,
  );
  const [body, setBody] = useState("");
  const [round, setRound] = useState(0);
  useOutcome(state, "Posted", () => {
    setBody("");
    setRound((r) => r + 1);
  });
  return (
    <form action={action} aria-label="Write" className="space-y-2 border-t pt-4">
      <MentionTextarea
        id={`thread-${threadId}`}
        name="body"
        value={body}
        onValueChange={setBody}
        people={people}
        rows={3}
        maxLength={8000}
        ariaLabel="Your message"
        placeholder="Write to the thread. Type @ to bring a teammate in."
      />
      {filesOn && <AttachFiles key={round} contactId={contactId} />}
      <div className="flex justify-end">
        <SubmitButton pendingText="Posting…" disabled={!body.trim()}>
          Post
        </SubmitButton>
      </div>
    </form>
  );
}
