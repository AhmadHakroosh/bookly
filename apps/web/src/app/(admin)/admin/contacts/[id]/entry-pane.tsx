"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { replyFromTimelineAction, type ReplyState } from "./timeline-actions";

/** A timeline entry in a right-hand pane, addressed by `?entry=<id>`. */
export function EntrySheet({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div className="p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Reply at the bottom of a thread in the pane. */
export function PaneReply({ contactId, parentId }: { contactId: string; parentId: string }) {
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
      <SubmitButton pendingText="Sending…">Send reply</SubmitButton>
    </form>
  );
}
