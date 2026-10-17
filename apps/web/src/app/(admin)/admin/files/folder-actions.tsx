"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createFolderAction,
  renameFolderAction,
  restoreFolderAction,
  trashFolderAction,
  type DriveResult,
} from "./actions";
import { RenameDialog } from "./file-actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<DriveResult>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error);
      toast.success(ok);
      after?.();
      router.refresh();
    });
  return { run, pending };
}

export function NewFolderButton({
  space,
  parentId,
}: {
  space: "personal" | "team";
  parentId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { run } = useRun();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FolderPlusIcon data-icon="inline-start" />
        New folder
      </Button>
      {open && (
        <RenameDialog
          open
          onOpenChange={setOpen}
          title="New folder"
          current=""
          onSave={(name) =>
            run(
              () => createFolderAction(space, parentId, name),
              "Folder created",
              () => setOpen(false),
            )
          }
        />
      )}
    </>
  );
}

export function FolderMenu({ folder }: { folder: { id: string; name: string } }) {
  const [renaming, setRenaming] = useState(false);
  const { run } = useRun();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for the folder ${folder.name}`}
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <PencilIcon className="size-4" aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run(() => trashFolderAction(folder.id), "Folder moved to the trash")}
          >
            <Trash2Icon className="size-4" aria-hidden />
            Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && (
        <RenameDialog
          open
          onOpenChange={setRenaming}
          title="Rename folder"
          current={folder.name}
          onSave={(name) =>
            run(
              () => renameFolderAction(folder.id, name),
              "Renamed",
              () => setRenaming(false),
            )
          }
        />
      )}
    </>
  );
}

export function RestoreFolderButton({ folderId }: { folderId: string }) {
  const { run, pending } = useRun();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => run(() => restoreFolderAction(folderId), "Restored")}
    >
      <RotateCcwIcon data-icon="inline-start" />
      Restore
    </Button>
  );
}
