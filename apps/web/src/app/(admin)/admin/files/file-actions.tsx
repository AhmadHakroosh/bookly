"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DownloadIcon,
  EyeIcon,
  FolderInputIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  listFoldersAction,
  moveFileAction,
  purgeFileAction,
  renameFileAction,
  restoreFileAction,
  searchContactsAction,
  setFileContactAction,
  trashFileAction,
  type DriveResult,
} from "./actions";

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

export function RenameDialog({
  open,
  onOpenChange,
  current,
  onSave,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string;
  onSave: (name: string) => void;
  title: string;
}) {
  const [name, setName] = useState(current);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(name);
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
            maxLength={200}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={!name.trim()}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  open,
  onOpenChange,
  fileId,
  canTeam,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fileId: string;
  canTeam: boolean;
}) {
  const [space, setSpace] = useState<"personal" | "team">("personal");
  const [folders, setFolders] = useState<{ id: string; path: string }[]>([]);
  const [folder, setFolder] = useState("root");
  const { run, pending } = useRun();
  useEffect(() => {
    if (open) void listFoldersAction(space).then(setFolders);
  }, [open, space]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {canTeam && (
            <Dropdown
              ariaLabel="Space"
              value={space}
              onValueChange={(v) => {
                setSpace(v as "personal" | "team");
                setFolder("root");
              }}
              options={[
                { value: "personal", label: "My files" },
                { value: "team", label: "Team" },
              ]}
            />
          )}
          <Dropdown
            ariaLabel="Folder"
            value={folder}
            onValueChange={setFolder}
            options={[
              {
                value: "root",
                label: space === "team" ? "Team (top level)" : "My files (top level)",
              },
              ...folders.map((f) => ({ value: f.id, label: f.path })),
            ]}
          />
          <Button
            className="w-full"
            disabled={pending}
            onClick={() =>
              run(
                () => moveFileAction(fileId, space, folder === "root" ? null : folder),
                "Moved",
                () => onOpenChange(false),
              )
            }
          >
            Move here
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  fileId,
  currentContactId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fileId: string;
  currentContactId: string | null;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; email: string }[]>([]);
  const { run, pending } = useRun();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void searchContactsAction(q).then(setFound), 200);
    return () => clearTimeout(t);
  }, [open, q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Belongs to a contact</DialogTitle>
        </DialogHeader>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contacts"
          aria-label="Search contacts"
          autoFocus
        />
        <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border" aria-label="Contacts">
          {found.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={pending}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() =>
                  run(
                    () => setFileContactAction(fileId, c.id),
                    `Now in ${c.name}'s folder`,
                    () => onOpenChange(false),
                  )
                }
              >
                <span className="block">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.email}</span>
              </button>
            </li>
          ))}
          {found.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">No contacts match.</li>
          )}
        </ul>
        {currentContactId && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () => setFileContactAction(fileId, null),
                "No longer in a contact's folder",
                () => onOpenChange(false),
              )
            }
          >
            Remove from the contact&apos;s folder
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The "…" menu of one file row (or the pane): open, download, rename, move, contact, delete. */
export function FileActions({
  file,
  openHref,
  canWrite,
  canTeam,
  trashed = false,
}: {
  file: { id: string; name: string; contactId: string | null };
  openHref: string;
  canWrite: boolean;
  canTeam: boolean;
  trashed?: boolean;
}) {
  const [dialog, setDialog] = useState<"rename" | "move" | "contact" | null>(null);
  const { run } = useRun();
  if (trashed)
    return (
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => run(() => restoreFileAction(file.id), "Restored")}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Restore
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.confirm(`Delete “${file.name}” for good? This cannot be undone.`))
              run(() => purgeFileAction(file.id), "Deleted for good");
          }}
        >
          <Trash2Icon data-icon="inline-start" />
          Delete forever
        </Button>
      </div>
    );
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${file.name}`} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem render={<Link href={openHref} scroll={false} />}>
            <EyeIcon className="size-4" aria-hidden />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href={`/files/${file.id}?download=1`} />}>
            <DownloadIcon className="size-4" aria-hidden />
            Download
          </DropdownMenuItem>
          {canWrite && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDialog("rename")}>
                <PencilIcon className="size-4" aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("move")}>
                <FolderInputIcon className="size-4" aria-hidden />
                Move
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("contact")}>
                <UserRoundIcon className="size-4" aria-hidden />
                Belongs to…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => run(() => trashFileAction(file.id), "Moved to the trash")}
              >
                <Trash2Icon className="size-4" aria-hidden />
                Move to trash
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "rename" && (
        <RenameDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title="Rename file"
          current={file.name}
          onSave={(name) =>
            run(
              () => renameFileAction(file.id, name),
              "Renamed",
              () => setDialog(null),
            )
          }
        />
      )}
      {dialog === "move" && (
        <MoveDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          fileId={file.id}
          canTeam={canTeam}
        />
      )}
      {dialog === "contact" && (
        <ContactDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          fileId={file.id}
          currentContactId={file.contactId}
        />
      )}
    </>
  );
}
