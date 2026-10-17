"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { MessagesSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openGuestThreadAction } from "./actions";

/** "Open in Messages" on a contact's page: their conversation, created if it is new. */
export function OpenConversationButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await openGuestThreadAction(contactId);
          if (r.error || !r.threadId) return void toast.error(r.error ?? "Could not open it.");
          router.push(`/admin/messages?thread=${r.threadId}`);
        })
      }
    >
      <MessagesSquareIcon data-icon="inline-start" />
      Open in Messages
    </Button>
  );
}
