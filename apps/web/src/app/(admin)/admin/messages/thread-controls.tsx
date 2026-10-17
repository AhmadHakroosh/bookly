"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArchiveIcon, ArchiveRestoreIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addParticipantsAction, setClosedAction } from "./actions";

/** Close a conversation (it leaves the inbox until someone writes again) or reopen it. */
export function CloseButton({ threadId, closed }: { threadId: string; closed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setClosedAction(threadId, !closed);
          if (r.error) return void toast.error(r.error);
          toast.success(closed ? "Reopened" : "Closed");
          router.refresh();
        })
      }
    >
      {closed ? (
        <ArchiveRestoreIcon data-icon="inline-start" />
      ) : (
        <ArchiveIcon data-icon="inline-start" />
      )}
      {closed ? "Reopen thread" : "Close thread"}
    </Button>
  );
}

/** Bring more teammates into a team thread. */
export function AddPeopleButton({
  threadId,
  people,
}: {
  threadId: string;
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  if (!people.length) return null;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <UserPlusIcon data-icon="inline-start" />
        Add people
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add people</DialogTitle>
          </DialogHeader>
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Teammates</legend>
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={picked.includes(p.id)}
                  onChange={(e) =>
                    setPicked((prev) =>
                      e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </fieldset>
          <Button
            disabled={pending || !picked.length}
            onClick={() =>
              start(async () => {
                const r = await addParticipantsAction(threadId, picked);
                if (r.error) return void toast.error(r.error);
                toast.success("Added");
                setOpen(false);
                setPicked([]);
                router.refresh();
              })
            }
          >
            Add {picked.length || ""}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
