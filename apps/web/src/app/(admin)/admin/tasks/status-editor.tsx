"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArchiveIcon, ArrowDownIcon, ArrowUpIcon, Columns3Icon } from "lucide-react";
import { ColorPicker } from "@/components/color-picker";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  archiveStatusAction,
  createStatusAction,
  reorderStatusesAction,
  updateStatusAction,
  type ActionResult,
} from "./actions";

export type EditableStatus = {
  id: string;
  name: string;
  color: string;
  isDone: boolean;
  isDefault: boolean;
  wipLimit: number | null;
  count: number;
};

function useToast(state: ActionResult, ok: string) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok) toast.success(ok);
  }, [state, ok]);
}

function StatusRow({
  s,
  others,
  first,
  last,
  onMove,
  busy,
}: {
  s: EditableStatus;
  others: EditableStatus[];
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  busy: boolean;
}) {
  const [state, action] = useActionState(updateStatusAction.bind(null, s.id), {} as ActionResult);
  useToast(state, "Saved");
  const [archiving, setArchiving] = useState(false);
  const [into, setInto] = useState(
    others.find((o) => o.isDone === s.isDone)?.id ?? others[0]?.id ?? "",
  );
  const [pending, start] = useTransition();
  return (
    <li className="space-y-3 rounded-xl border p-3">
      <form action={action} className="space-y-3">
        <div className="flex items-center gap-2">
          <ColorPicker
            name="color"
            defaultValue={s.color}
            ariaLabel={`Color of ${s.name}`}
            className="w-28"
          />
          <Input
            name="name"
            defaultValue={s.name}
            aria-label="Status name"
            maxLength={40}
            required
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${s.name} left`}
            disabled={first || busy}
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${s.name} right`}
            disabled={last || busy}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isDone" defaultChecked={s.isDone} /> Counts as done
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={s.isDefault}
              disabled={s.isDefault}
            />{" "}
            Default for new tasks
          </label>
          <label className="flex items-center gap-2">
            WIP limit
            <Input
              name="wipLimit"
              type="number"
              min={1}
              max={999}
              defaultValue={s.wipLimit ?? ""}
              className="w-20"
              aria-label={`WIP limit for ${s.name}`}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton variant="outline" size="sm" pendingText="Saving…">
            Save
          </SubmitButton>
          <span className="text-xs text-muted-foreground">
            {s.count} task{s.count === 1 ? "" : "s"}
          </span>
          {!archiving && others.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setArchiving(true)}
            >
              <ArchiveIcon data-icon="inline-start" />
              Archive
            </Button>
          )}
        </div>
      </form>
      {archiving && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2 text-sm">
          <span>Move its tasks to</span>
          <Dropdown
            ariaLabel="Move tasks to"
            size="sm"
            value={into}
            onValueChange={setInto}
            className="w-40"
            options={others.map((o) => ({ value: o.id, label: o.name }))}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !into}
            onClick={() =>
              start(async () => {
                const r = await archiveStatusAction(s.id, into);
                if (r.error) toast.error(r.error);
                else toast.success(`${s.name} archived`);
              })
            }
          >
            Archive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setArchiving(false)}>
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}

/** Owners and admins shape the board: add, rename, colour, reorder, archive statuses. */
export function StatusEditor({ statuses }: { statuses: EditableStatus[] }) {
  const [state, action] = useActionState(createStatusAction, {} as ActionResult);
  useToast(state, "Status added");
  const [busy, start] = useTransition();
  const move = (i: number, dir: -1 | 1) =>
    start(async () => {
      const ids = statuses.map((s) => s.id);
      const [moved] = ids.splice(i, 1);
      ids.splice(i + dir, 0, moved!);
      const r = await reorderStatusesAction(ids);
      if (r.error) toast.error(r.error);
    });
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        <Columns3Icon data-icon="inline-start" />
        Statuses
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-5 data-[side=right]:sm:max-w-lg"
      >
        <SheetTitle className="text-lg font-semibold">Statuses</SheetTitle>
        <p className="text-sm text-muted-foreground">
          The board&apos;s columns, left to right. Model your own flow: a clinic might use New →
          Contacted → Scheduled → Seen → Billed. Tasks in a done status count as finished.
        </p>
        <ul className="space-y-3">
          {statuses.map((s, i) => (
            <StatusRow
              key={`${s.id}:${s.name}:${s.color}:${s.isDone}:${s.isDefault}:${s.wipLimit}`}
              s={s}
              others={statuses.filter((o) => o.id !== s.id)}
              first={i === 0}
              last={i === statuses.length - 1}
              onMove={(dir) => move(i, dir)}
              busy={busy}
            />
          ))}
        </ul>
        <form action={action} className="space-y-3 rounded-xl border border-dashed p-3">
          <p className="text-sm font-medium">Add a status</p>
          <div className="flex items-center gap-2">
            <ColorPicker name="color" ariaLabel="Color of the new status" className="w-28" />
            <Input
              name="name"
              placeholder="Waiting on client"
              aria-label="New status name"
              maxLength={40}
              required
              className="flex-1"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDone" /> Counts as done
          </label>
          <SubmitButton variant="outline" pendingText="Adding…">
            Add status
          </SubmitButton>
        </form>
      </SheetContent>
    </Sheet>
  );
}
