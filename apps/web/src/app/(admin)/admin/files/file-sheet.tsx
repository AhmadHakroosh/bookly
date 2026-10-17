"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unlinkFileFromTaskAction } from "./actions";

/** A file's content in the right-hand pane (`PaneHost`, `?file=<id>`). */
export function FileSheet({
  children,
}: {
  title?: string;
  closeHref?: string;
  children: ReactNode;
}) {
  return <div className="p-5">{children}</div>;
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
