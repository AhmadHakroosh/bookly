"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { unlinkFileFromTaskAction } from "./actions";

/** A file in a right-hand pane over the drive, addressed by `?file=<id>`. */
export function FileSheet({
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

export function UnlinkTaskButton({
  fileId,
  taskId,
  title,
}: {
  fileId: string;
  taskId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Unlink from ${title}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await unlinkFileFromTaskAction(fileId, taskId);
          if (r.error) toast.error(r.error);
          router.refresh();
        })
      }
    >
      <XIcon />
    </Button>
  );
}
