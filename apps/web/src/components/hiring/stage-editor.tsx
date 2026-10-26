"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  EyeIcon,
  FileTextIcon,
  FolderIcon,
  GripVerticalIcon,
  ListChecksIcon,
  MailIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ScaleIcon,
  SplitIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import type { StageCategory } from "@bookly/db/schema";
import {
  addStageAction,
  duplicateStageAction,
  removeStageAction,
  reorderStagesAction,
  toggleModuleAction,
  updateStageAction,
} from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Dropdown } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ModuleKind } from "@/server/pipelines/modules";
import {
  candidateLabel,
  CATEGORY_LABELS,
  defaultLabel,
  HIRING_MODULES,
  isFinal,
  MODULE_LABEL,
  MODULE_PURPOSE,
  moduleSummary,
  STAGE_LIMITS,
  type Problem,
  type SetupStage,
} from "@/server/hiring/setup-text";
import { ApplicantPreview, type PreviewData } from "./applicant-preview";
import { ModulePanel, type PanelData } from "./module-panels";
import { RuleBuilder } from "./rule-builder";
import { CATEGORY_EDGE } from "./stage-chip";

const ICONS: Record<ModuleKind, LucideIcon> = {
  forms: FileTextIcon,
  reviews: ClipboardCheckIcon,
  scheduling: CalendarIcon,
  video: VideoIcon,
  messages: MailIcon,
  tasks: ListChecksIcon,
  files: FolderIcon,
  payments: CreditCardIcon,
  routing: SplitIcon,
  decisions: ScaleIcon,
};

const CATEGORY_OPTIONS = (["open", "hold", "won", "lost"] as StageCategory[]).map((c) => ({
  value: c,
  label: CATEGORY_LABELS[c],
}));

const CATEGORY_HELP =
  "Open: still in progress. Hold: paused or waitlisted. Won: admitted or accepted. Lost: not selected or withdrawn. Reports use categories, so name stages however you like.";

export type EditorData = Omit<PanelData, "stage"> & {
  problems: Problem[];
  preview: PreviewData;
  initialStage?: string;
  initialModule?: string;
};

const on = (s: SetupStage, k: ModuleKind) => !!s.modules[k] && s.modules[k]?.enabled !== false;

/**
 * The editor's own width, not the window's: beside the app's sidebar a 1280 px window leaves
 * less room than the spec's three regions need. Two regions from 720 px (list and
 * configuration; below, the configuration opens in a sheet), three from 1120 px (the preview).
 */
function useRegions(ref: React.RefObject<HTMLDivElement | null>) {
  const width = useSyncExternalStore(
    (cb) => {
      const el = ref.current;
      if (!el) return () => {};
      const o = new ResizeObserver(cb);
      o.observe(el);
      return () => o.disconnect();
    },
    () => ref.current?.clientWidth ?? 1200,
    () => 1200,
  );
  return { wide: width >= 720, xwide: width >= 1120 };
}

/**
 * S3, the stage editor: the stages in order (drag, keyboard or the row menu to reorder), the
 * selected stage's name, category, label, modules and rules, and the applicant preview. Every
 * change is saved at once and the problems that block publishing show where they are.
 */
export function StageEditor({ data }: { data: EditorData }) {
  const root = useRef<HTMLDivElement>(null);
  const { wide, xwide } = useRegions(root);
  const [selected, setSelected] = useState(
    data.stages.find((s) => s.key === data.initialStage)?.key ?? data.stages[0]?.key ?? "",
  );
  const [sheet, setSheet] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [focus, setFocus] = useState<"name" | "category" | null>(null);
  const stage = data.stages.find((s) => s.key === selected) ?? data.stages[0];

  const select = (key: string, f: "name" | "category" | null = null) => {
    setSelected(key);
    setFocus(f);
    if (!wide) setSheet(true);
    const url = new URL(window.location.href);
    url.searchParams.set("stage", key);
    url.searchParams.delete("module");
    window.history.replaceState(null, "", url);
  };

  const problemCount = data.problems.length;
  const panel: PanelData | null = stage ? { ...data, stage } : null;
  const config = panel && (
    <StageConfig
      key={stage!.key}
      data={panel}
      focus={focus}
      initialModule={stage!.key === data.initialStage ? data.initialModule : undefined}
    />
  );
  return (
    <div ref={root} className="space-y-4">
      {problemCount > 0 && (
        <div
          role="status"
          className="rounded-lg border border-warning/40 bg-warning-muted p-3 text-sm"
        >
          <p className="font-medium">
            {problemCount === 1
              ? "1 thing to fix before publishing"
              : `${problemCount} things to fix before publishing`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {data.problems.map((p, i) => (
              <li key={i}>
                {p.stageKey ? (
                  <button
                    type="button"
                    className="text-left underline underline-offset-2"
                    onClick={() => select(p.stageKey!)}
                  >
                    {p.message}
                  </button>
                ) : (
                  p.message
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div
        className={cn(
          "grid grid-cols-1 items-start gap-6",
          xwide
            ? "grid-cols-[280px_minmax(0,1fr)_380px]"
            : wide && "grid-cols-[260px_minmax(0,1fr)]",
        )}
      >
        <StageList data={data} selected={stage?.key ?? ""} onSelect={select} />
        {wide && <div className="min-w-0 rounded-xl border bg-card p-5">{config}</div>}
        {xwide && stage && (
          <aside aria-label="Applicant preview" className="min-w-0 rounded-xl border bg-card p-4">
            <ApplicantPreview data={data.preview} stageKey={stage.key} />
          </aside>
        )}
      </div>
      {!xwide && stage && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <EyeIcon data-icon="inline-start" />
            Preview
          </Button>
        </div>
      )}
      <Sheet open={!wide && sheet} onOpenChange={setSheet}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto data-[side=right]:sm:max-w-full"
        >
          <SheetHeader>
            <SheetTitle>{stage?.name}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{config}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={!xwide && previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Preview</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {stage && <ApplicantPreview data={data.preview} stageKey={stage.key} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---------------- The stage list ---------------- */

function StageList({
  data,
  selected,
  onSelect,
}: {
  data: EditorData;
  selected: string;
  onSelect: (key: string, focus?: "name" | "category" | null) => void;
}) {
  // The order the server has, shown moved at once while a reorder saves.
  const [order, setOrder] = useOptimistic(data.stages.map((s) => s.key));
  const [live, setLive] = useState("");
  const [pending, start] = useTransition();
  const byKey = useMemo(() => new Map(data.stages.map((s) => [s.key, s])), [data.stages]);
  const entry = data.stages.find((s) => s.isEntry);
  const keys = order.filter((k) => byKey.has(k));
  const open = keys.filter((k) => !byKey.get(k)!.isEntry && !isFinal(byKey.get(k)!.category));
  const outcomes = keys.filter((k) => isFinal(byKey.get(k)!.category));
  const save = (next: string[], moved: string) => {
    const s = byKey.get(moved)!;
    setLive(`${s.name} moved to position ${next.indexOf(moved) + 1} of ${next.length}.`);
    start(async () => {
      setOrder(next);
      const r = await reorderStagesAction(data.oppId, next);
      if (r.error) toast.error(r.error);
    });
  };
  /** Moves within its group (open stages, or outcomes); the entry stage never moves. */
  const move = (key: string, dir: -1 | 1) => {
    const group = open.includes(key) ? open : outcomes;
    const i = group.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= group.length) return;
    const g = arrayMove(group, i, j);
    save(
      [
        ...(entry ? [entry.key] : []),
        ...(group === open ? g : open),
        ...(group === outcomes ? g : outcomes),
      ],
      key,
    );
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const a = String(active.id);
    const b = String(over.id);
    const group = open.includes(a) ? open : outcomes;
    if (!group.includes(b)) return;
    const g = arrayMove(group, group.indexOf(a), group.indexOf(b));
    save(
      [
        ...(entry ? [entry.key] : []),
        ...(group === open ? g : open),
        ...(group === outcomes ? g : outcomes),
      ],
      a,
    );
  };
  const name = (id: unknown) => byKey.get(String(id))?.name ?? "Stage";
  const position = (id: unknown) => {
    const g = open.includes(String(id)) ? open : outcomes;
    return `${g.indexOf(String(id)) + 1} of ${g.length}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${name(active.id)}. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} is over position ${position(over.id)}.` : "",
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} dropped at position ${position(over.id)}.` : "Dropped.",
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };
  const row = (key: string, sortable: boolean) => {
    const s = byKey.get(key)!;
    const group = open.includes(key) ? open : outcomes;
    return (
      <StageRow
        key={key}
        stage={s}
        sortable={sortable && !data.readOnly}
        selected={selected === key}
        problems={data.problems.filter((p) => p.stageKey === key)}
        onSelect={onSelect}
        readOnly={data.readOnly}
        canUp={sortable && group.indexOf(key) > 0}
        canDown={sortable && group.indexOf(key) < group.length - 1}
        onMove={(d) => move(key, d)}
        oppId={data.oppId}
        stages={data.stages}
      />
    );
  };
  return (
    <section
      aria-labelledby="stage-list-title"
      className="rounded-xl border bg-card p-3"
      aria-busy={pending}
    >
      <h3 id="stage-list-title" className="sr-only">
        Stages
      </h3>
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      <DndContext
        // A fixed id: dnd-kit's own counter differs between the server and the browser.
        id="stage-list"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{ announcements }}
      >
        <ol className="space-y-1">
          {entry && row(entry.key, false)}
          <SortableContext items={open} strategy={verticalListSortingStrategy}>
            {open.map((k) => row(k, true))}
          </SortableContext>
        </ol>
        <div className="mt-3 mb-1 border-t pt-3">
          <p className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Outcomes
          </p>
          <p className="px-2 text-xs text-muted-foreground">
            Applications reach an outcome only when someone on your team decides.
          </p>
        </div>
        <ol className="space-y-1">
          <SortableContext items={outcomes} strategy={verticalListSortingStrategy}>
            {outcomes.map((k) => row(k, true))}
          </SortableContext>
        </ol>
      </DndContext>
      {!data.readOnly && (
        <AddStage oppId={data.oppId} full={data.stages.length >= STAGE_LIMITS.max} />
      )}
    </section>
  );
}

function StageRow({
  stage,
  sortable,
  selected,
  problems,
  onSelect,
  readOnly,
  canUp,
  canDown,
  onMove,
  oppId,
  stages,
}: {
  stage: SetupStage;
  sortable: boolean;
  selected: boolean;
  problems: Problem[];
  onSelect: (key: string, focus?: "name" | "category" | null) => void;
  readOnly: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
  oppId: string;
  stages: SetupStage[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.key,
    disabled: !sortable,
  });
  const [removing, setRemoving] = useState(false);
  const [pending, start] = useTransition();
  const mods = HIRING_MODULES.filter((k) => on(stage, k));
  const problemText =
    problems[0]?.code === "final_stage_without_message"
      ? "Needs a message"
      : problems[0]?.code === "entry_forms"
        ? "Needs the form"
        : problems.length
          ? "Needs work"
          : null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-1 rounded-lg border border-l-[3px] bg-background pr-1",
        CATEGORY_EDGE[stage.category],
        selected && "border-primary bg-accent",
        isDragging && "z-10 shadow-md",
      )}
    >
      {sortable ? (
        <button
          type="button"
          className="flex h-10 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
          aria-label={`Reorder ${stage.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
      ) : (
        <span className="w-6 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => onSelect(stage.key)}
        aria-current={selected ? "true" : undefined}
        className="min-w-0 flex-1 py-2 text-left"
      >
        <span className="block truncate text-sm font-medium">{stage.name}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {CATEGORY_LABELS[stage.category]}
          {stage.isWaitlist && " · Waitlist"}
          {mods.length > 0 && <span aria-hidden>·</span>}
          {mods.slice(0, 5).map((k) => {
            const Icon = ICONS[k];
            return <Icon key={k} className="size-3" aria-hidden />;
          })}
          {mods.length > 5 && <span aria-hidden>+{mods.length - 5}</span>}
          <span className="sr-only">Modules: {mods.map(MODULE_LABEL).join(", ") || "none"}</span>
        </span>
        {problemText && (
          <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
            <CircleAlertIcon className="size-3" aria-hidden />
            {problemText}
          </span>
        )}
      </button>
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${stage.name}`} />
            }
          >
            {pending ? <Spinner /> : <MoreHorizontalIcon />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSelect(stage.key, "name")}>Rename</DropdownMenuItem>
            <DropdownMenuItem disabled={!canUp} onClick={() => onMove(-1)}>
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canDown} onClick={() => onMove(1)}>
              Move down
            </DropdownMenuItem>
            {!stage.isEntry && (
              <DropdownMenuItem onClick={() => onSelect(stage.key, "category")}>
                Change category
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                start(async () => {
                  const r = await duplicateStageAction(oppId, stage.id);
                  if (r.error) toast.error(r.error);
                })
              }
            >
              Duplicate
            </DropdownMenuItem>
            {!stage.isEntry && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}>
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {removing && (
        <RemoveStageDialog
          oppId={oppId}
          stage={stage}
          stages={stages}
          onClose={() => setRemoving(false)}
        />
      )}
    </li>
  );
}

function AddStage({ oppId, full }: { oppId: string; full: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StageCategory>("open");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full"
        disabled={full}
        onClick={() => setOpen(true)}
      >
        <PlusIcon data-icon="inline-start" />
        Add stage
      </Button>
    );
  return (
    <form
      className="mt-2 space-y-2 rounded-lg border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addStageAction(oppId, name, category);
          if (r.error) return setError(r.error);
          setName("");
          setError(null);
          setOpen(false);
        });
      }}
    >
      <Input
        aria-label="Stage name"
        autoFocus
        placeholder="Stage name"
        maxLength={STAGE_LIMITS.nameMax}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Dropdown
        ariaLabel="Category"
        value={category}
        options={CATEGORY_OPTIONS}
        onValueChange={(v) => setCategory(v as StageCategory)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="outline" disabled={pending || !name.trim()}>
          {pending && <Spinner data-icon="inline-start" />}
          Add
        </Button>
      </div>
    </form>
  );
}

function RemoveStageDialog({
  oppId,
  stage,
  stages,
  onClose,
}: {
  oppId: string;
  stage: SetupStage;
  stages: SetupStage[];
  onClose: () => void;
}) {
  const targets = stages.filter((s) => s.category === "open" && s.key !== stage.key);
  const [to, setTo] = useState(targets[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = stage.applications;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {n
              ? `Move ${n} application${n === 1 ? "" : "s"} before removing ${stage.name}`
              : `Remove ${stage.name}?`}
          </DialogTitle>
          <DialogDescription>
            {n
              ? "Choose where they go. Their history stays."
              : "Its modules and rules go with it. History keeps the stage's name."}
          </DialogDescription>
        </DialogHeader>
        {n > 0 && (
          <Dropdown
            ariaLabel="Move applications to"
            value={to}
            options={targets.map((s) => ({ value: s.key, label: s.name }))}
            onValueChange={setTo}
          />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await removeStageAction(oppId, stage.id, n ? to : null);
                if (r?.error) setError(r.error);
              })
            }
          >
            {pending && <Spinner data-icon="inline-start" />}
            {n ? "Move and remove" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- One stage ---------------- */

function StageConfig({
  data,
  focus,
  initialModule,
}: {
  data: PanelData;
  focus: "name" | "category" | null;
  initialModule?: string;
}) {
  const { stage } = data;
  const [name, setName] = useState(stage.name);
  const [label, setLabel] = useState(stage.label ?? "");
  const [openModule, setOpenModule] = useState<ModuleKind | null>(
    (HIRING_MODULES as string[]).includes(initialModule ?? "")
      ? (initialModule as ModuleKind)
      : null,
  );
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus === "name") nameRef.current?.focus();
    if (focus === "category") categoryRef.current?.querySelector("button")?.focus();
  }, [focus]);
  useEffect(() => {
    if (initialModule)
      document.getElementById(`module-${initialModule}`)?.scrollIntoView({ block: "center" });
  }, [initialModule]);
  const patch = (p: Parameters<typeof updateStageAction>[2], revert?: () => void) =>
    start(async () => {
      const r = await updateStageAction(data.oppId, stage.id, p);
      if (r.error) {
        toast.error(r.error);
        revert?.();
      }
    });
  const criteria = (id: string | null) => data.scorecards.find((s) => s.id === id)?.criteria ?? 0;
  const eventTypes = new Map(data.eventTypes.map((e) => [e.value, e.label]));
  return (
    <div className="@container space-y-6" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <div className="@lg:col-span-2">
          <label htmlFor="stage-name" className="mb-2 block text-sm font-medium">
            Stage name
          </label>
          <Input
            id="stage-name"
            ref={nameRef}
            value={name}
            maxLength={STAGE_LIMITS.nameMax}
            disabled={data.readOnly}
            className="text-base font-semibold"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== stage.name && patch({ name }, () => setName(stage.name))}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          />
        </div>
        <div ref={categoryRef}>
          <span className="mb-2 block text-sm font-medium" id="stage-category-label">
            Category
          </span>
          <Dropdown
            ariaLabel="Category"
            value={stage.category}
            disabled={data.readOnly || stage.isEntry}
            options={CATEGORY_OPTIONS}
            onValueChange={(v) => v !== stage.category && patch({ category: v as StageCategory })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {stage.isEntry
              ? "The first stage receives applications, so it stays open."
              : CATEGORY_HELP}
          </p>
          {stage.category === "hold" && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <Checkbox
                checked={stage.isWaitlist}
                disabled={data.readOnly}
                onCheckedChange={(v) => patch({ isWaitlist: !!v })}
              />
              This is the waitlist
            </label>
          )}
        </div>
        <div>
          <label htmlFor="stage-label" className="mb-2 block text-sm font-medium">
            What applicants see
          </label>
          <Input
            id="stage-label"
            value={label}
            maxLength={80}
            disabled={data.readOnly}
            placeholder={defaultLabel(stage)}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label !== (stage.label ?? "") && patch({ label })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Applicants see this instead of the stage name. Keep it plain: &ldquo;Under
            review&rdquo;, &ldquo;Interview&rdquo;. Now: &ldquo;
            {candidateLabel({ ...stage, label })}&rdquo;.
          </p>
        </div>
      </div>

      <section aria-labelledby={`modules-${stage.key}`} className="space-y-2">
        <h3 id={`modules-${stage.key}`} className="text-sm font-semibold">
          Modules
        </h3>
        <ul className="divide-y rounded-lg border">
          {HIRING_MODULES.map((k) => (
            <ModuleRow
              key={k}
              kind={k}
              data={data}
              open={openModule === k}
              onToggleOpen={() => setOpenModule(openModule === k ? null : k)}
              summary={
                on(stage, k)
                  ? moduleSummary(k, stage.modules, { stage, criteria, eventTypes })
                  : MODULE_PURPOSE[k]
              }
            />
          ))}
        </ul>
      </section>

      <RuleBuilder data={data} />
    </div>
  );
}

function ModuleRow({
  kind,
  data,
  open,
  onToggleOpen,
  summary,
}: {
  kind: ModuleKind;
  data: PanelData;
  open: boolean;
  onToggleOpen: () => void;
  summary: string;
}) {
  const { stage } = data;
  const enabled = on(stage, kind);
  const [pending, start] = useTransition();
  const Icon = ICONS[kind];
  const locked = kind === "forms" && stage.isEntry;
  return (
    <li id={`module-${kind}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{MODULE_LABEL(kind)}</p>
          <p className="truncate text-xs text-muted-foreground">{summary}</p>
        </div>
        {enabled && (
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={open}
            aria-controls={`module-panel-${kind}`}
            onClick={onToggleOpen}
          >
            Configure
            <ChevronDownIcon
              data-icon="inline-end"
              className={cn("transition-transform", open && "rotate-180")}
            />
          </Button>
        )}
        {pending ? (
          <Spinner />
        ) : (
          <Switch
            checked={enabled}
            disabled={data.readOnly || locked}
            aria-label={`${MODULE_LABEL(kind)} on ${stage.name}`}
            onCheckedChange={(v) =>
              start(async () => {
                const r = await toggleModuleAction(data.oppId, stage.id, kind, v);
                if (r.error) toast.error(r.error);
                else if (v && !open) onToggleOpen();
              })
            }
          />
        )}
      </div>
      {enabled && open && (
        <div id={`module-panel-${kind}`} className="border-t bg-muted/20 px-3 py-3">
          <p className="mb-3 text-xs text-muted-foreground">{MODULE_PURPOSE[kind]}</p>
          <ModulePanel kind={kind} data={data} />
        </div>
      )}
    </li>
  );
}
