"use client";

import { useEffect, useState, useTransition } from "react";
import { FileIcon, PaperclipIcon, SearchIcon } from "lucide-react";
import { findFilesAction, type ClientFile } from "@/app/(admin)/admin/files/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatSize } from "@/lib/upload-client";

/**
 * "Add from Files": search the drive (or a contact's folder first) and pick files to attach or
 * link. Only files the member can see are offered; the server checks again when they are used.
 */
export function FilePicker({
  label = "Add from Files",
  contactId,
  onPick,
  exclude = [],
}: {
  label?: string;
  /** Start in this contact's folder. */
  contactId?: string | null;
  onPick: (files: ClientFile[]) => void;
  exclude?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [chosen, setChosen] = useState<Map<string, ClientFile>>(new Map());
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(
      () =>
        start(async () => {
          const r = await findFilesAction({ q, contactId: q ? null : contactId });
          setFiles((r?.files ?? []).filter((f) => !exclude.includes(f.id)));
        }),
      q ? 250 : 0,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exclude is a fresh array each render
  }, [open, q, contactId]);

  const toggle = (f: ClientFile) =>
    setChosen((prev) => {
      const next = new Map(prev);
      if (next.has(f.id)) next.delete(f.id);
      else next.set(f.id, f);
      return next;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setChosen(new Map());
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <PaperclipIcon data-icon="inline-start" />
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <label className="relative block">
          <SearchIcon
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your files"
            className="pl-9"
            aria-label="Search files"
            autoFocus
          />
        </label>
        <ul
          className="max-h-80 divide-y overflow-y-auto rounded-lg border"
          aria-label="Files"
          aria-busy={loading}
        >
          {files.length === 0 && (
            <li className="p-4 text-center text-sm text-muted-foreground">
              {loading ? "Looking…" : "No files here yet."}
            </li>
          )}
          {files.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                <input type="checkbox" checked={chosen.has(f.id)} onChange={() => toggle(f)} />
                <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatSize(f.size)}
                    {f.contactName ? ` · ${f.contactName}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          disabled={!chosen.size}
          onClick={() => {
            onPick([...chosen.values()]);
            setOpen(false);
            setChosen(new Map());
          }}
        >
          {chosen.size ? `Add ${chosen.size} file${chosen.size === 1 ? "" : "s"}` : "Choose files"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
