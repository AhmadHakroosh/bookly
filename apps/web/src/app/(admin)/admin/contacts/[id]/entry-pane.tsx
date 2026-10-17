"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { AttachFiles } from "@/components/drive/attach-files";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { replyFromTimelineAction, type ReplyState } from "./timeline-actions";

/** A timeline entry's content in the right-hand pane (`PaneHost`, `?entry=<id>`). */
export function EntrySheet({
  children,
}: {
  title?: string;
  closeHref?: string;
  children: ReactNode;
}) {
  return <div className="p-5">{children}</div>;
}

/** Reply at the bottom of a thread in the pane. */
export function PaneReply({
  contactId,
  parentId,
  filesOn = false,
}: {
  contactId: string;
  parentId: string;
  filesOn?: boolean;
}) {
  const [state, action] = useActionState(
    replyFromTimelineAction.bind(null, contactId, parentId),
    {} as ReplyState,
  );
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok) toast.success("Reply sent");
  }, [state]);
  return (
    <form action={action} className="space-y-2 border-t pt-4">
      <Textarea
        name="body"
        rows={5}
        required
        maxLength={8000}
        aria-label="Your reply"
        placeholder="Write your reply"
      />
      {filesOn && <AttachFiles contactId={contactId} />}
      <SubmitButton pendingText="Sending…">Send reply</SubmitButton>
    </form>
  );
}
