"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  ClockIcon,
  MoreHorizontalIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type { StageCategory } from "@bookly/db/schema";
import { cn } from "cn";
import { openPane } from "@/components/pane";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { KanbanCard, KanbanColumn, KanbanList } from "@/components/ui/kanban";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CardLine } from "@/server/hiring/pipeline-text";
import { StageChip } from "./stage-chip";
import { useMove } from "./move";
import { FILTERS, type Filter } from "./pipeline-filters";

export type BoardStage = { id: string; name: string; category: StageCategory };

export type PipelineCard = {
  id: string;
  name: string;
  initials: string;
  applied: string;
  stageId: string | null;
  line: CardLine | null;
  /** What the list's filters and Needs attention match on. */
  is: { flagged: boolean; feedback: boolean; scheduling: boolean; waiting: boolean };
};

const ICONS = {
  flag: AlertTriangleIcon,
  calendar: CalendarIcon,
  review: ClipboardCheckIcon,
  clock: ClockIcon,
};

const isOutcome = (s: BoardStage) => s.category !== "open";
const outcomeNote = (s: BoardStage) =>
  `${s.name} is an outcome. People reach it when someone records a decision, not by moving a card.`;

/** The pane link for a card: this page's address with `?application=`. */
function paneHref(id: string) {
  const u = new URL(window.location.href);
  u.searchParams.set("application", id);
  return `${u.pathname}${u.search}`;
}

function Line({ line }: { line: CardLine | null }) {
  if (!line) return null;
  const Icon = ICONS[line.icon];
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs",
        line.tone === "warning" ? "font-medium text-brand" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{line.text}</span>
    </p>
  );
}

function MoveMenu({
  card,
  stages,
  onMove,
  label,
}: {
  card: PipelineCard;
  stages: BoardStage[];
  onMove: (to: BoardStage) => void;
  label: string;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={`More for ${label}`} />}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openPane(paneHref(card.id), router.refresh)}>
          Open
        </DropdownMenuItem>
        {stages.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {stages
                .filter((s) => s.id !== card.stageId)
                .map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => onMove(s)}>
                    {s.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CardBody({
  card,
  open,
  overlay = false,
  selecting,
  checked,
  onCheck,
  menu,
}: {
  card: PipelineCard;
  open: boolean;
  overlay?: boolean;
  selecting: boolean;
  checked?: boolean;
  onCheck?: (on: boolean) => void;
  menu?: React.ReactNode;
}) {
  return (
    <KanbanCard selected={open} lifted={overlay} className="group/card relative space-y-2.5 p-3">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar size="lg">
            <AvatarFallback>{card.initials}</AvatarFallback>
          </Avatar>
          {onCheck && (
            // Over the avatar, as in mail: shown on hover and focus, and while selecting.
            <span
              className={cn(
                "absolute inset-0 z-10 flex items-center justify-center rounded-full bg-card transition-opacity",
                selecting || checked
                  ? "opacity-100"
                  : "opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(on) => onCheck(on === true)}
                aria-label={`Select ${card.name}`}
              />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {/* The whole card opens the pane; the link is the one thing screen readers hear. */}
          <a
            href={overlay ? undefined : `?application=${card.id}`}
            data-card-link
            className="block truncate font-semibold outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {card.name}
          </a>
          <p className="text-xs text-muted-foreground">{card.applied}</p>
        </div>
        {menu && <div className="relative z-10 -me-1 -mt-1">{menu}</div>}
      </div>
      <Line line={card.line} />
    </KanbanCard>
  );
}

function DraggableCard({
  card,
  canMove,
  ...rest
}: Omit<Parameters<typeof CardBody>[0], "overlay"> & { canMove: boolean }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: card.id, disabled: !canMove });
  // Pointer and touch drag only: keyboard and screen-reader users move with the card's menu
  // or the bulk bar (WCAG 2.5.7), so the card stays a list item with a link, not a button.
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      data-card-id={card.id}
      className={cn(canMove && "cursor-grab touch-manipulation", isDragging && "opacity-40")}
    >
      <CardBody card={card} {...rest} />
    </li>
  );
}

function Column({
  stage,
  cards,
  children,
  onSelectAll,
}: {
  stage: BoardStage;
  cards: PipelineCard[];
  children: React.ReactNode;
  onSelectAll?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${stage.id}` });
  return (
    <KanbanColumn
      ref={setNodeRef}
      title={stage.name}
      count={cards.length}
      highlight={isOver && !isOutcome(stage)}
      actions={
        onSelectAll && cards.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label={`More for ${stage.name}`} />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSelectAll}>Select all in {stage.name}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
    >
      <KanbanList>
        {children}
        {cards.length === 0 && (
          <li className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            {isOutcome(stage) ? "Reached when a decision is recorded" : "No one here yet"}
          </li>
        )}
      </KanbanList>
    </KanbanColumn>
  );
}

function BulkBar({
  count,
  stages,
  busy,
  onMove,
  onClear,
}: {
  count: number;
  stages: BoardStage[];
  busy: boolean;
  onMove: (to: BoardStage) => void;
  onClear: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Selected applications"
      className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm shadow-lg"
    >
      <span className="font-medium tabular-nums" aria-live="polite">
        {count} selected
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" disabled={busy} />}>
          Move to…
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Move {count} to</DropdownMenuLabel>
            {stages.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => onMove(s)}>
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Outcomes are recorded as decisions.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <XIcon data-icon="inline-start" />
        Clear
      </Button>
    </div>
  );
}

/**
 * The Pipeline tab (hiring.png): a column per stage with the cards in it, or the same people as
 * a filterable list. Coordinators drag cards between open stages (mouse or finger), or use a
 * card's menu or the bulk bar; a move shows at once and the server has the last word (exit
 * checks, outcomes). Opening a card opens the candidate pane beside the board.
 */
export function PipelineBoard({
  opportunityId,
  stages,
  cards,
  canMove,
  view,
  filter: initialFilter,
}: {
  opportunityId: string;
  stages: BoardStage[];
  cards: PipelineCard[];
  canMove: boolean;
  view: "board" | "list";
  filter: Filter;
}) {
  const router = useRouter();
  const openId = useSearchParams().get("application");
  // Optimistic placement on top of the server's cards, until the server's cards agree.
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState(cards);
  if (seen !== cards) {
    // Keep the moves the server hasn't confirmed yet (another move's refresh can land first).
    setSeen(cards);
    setPlaced((p) =>
      Object.fromEntries(
        Object.entries(p).filter(([id, to]) => cards.some((c) => c.id === id && c.stageId !== to)),
      ),
    );
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [stageFilter, setStageFilter] = useState("");
  const [query, setQuery] = useState("");
  const dragged = useRef(false);

  const { move, dialog, busy } = useMove(opportunityId, (moved) => {
    if (moved) setSelected(new Set());
    else setPlaced({});
  });
  const open = stages.filter((s) => !isOutcome(s));
  const live = useMemo(
    () => cards.map((c) => (placed[c.id] ? { ...c, stageId: placed[c.id]! } : c)),
    [cards, placed],
  );

  const moveTo = (ids: string[], to: BoardStage) => {
    if (isOutcome(to)) return toast.error(outcomeNote(to));
    const movers = ids.filter((id) => live.find((c) => c.id === id)?.stageId !== to.id);
    if (!movers.length) return;
    setPlaced((p) => ({ ...p, ...Object.fromEntries(movers.map((id) => [id, to.id])) }));
    move(movers, to.id, to.name);
  };

  const check = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  // The click that ends a drag (if any) comes right after; let it pass, then clicks open again.
  const dropped = () => {
    setActiveId(null);
    setTimeout(() => (dragged.current = false), 0);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    dropped();
    const to = stages.find((s) => over && `column:${s.id}` === over.id);
    if (to) moveTo([String(active.id)], to);
  };

  const selecting = selected.size > 0;
  // People in an outcome stage got there by a decision: they move only when it changes.
  const movable = (c: PipelineCard) => canMove && open.some((s) => s.id === c.stageId);
  const card = (c: PipelineCard) => ({
    card: c,
    open: openId === c.id,
    selecting,
    checked: selected.has(c.id),
    onCheck: movable(c) ? (on: boolean) => check(c.id, on) : undefined,
    menu: (
      <MoveMenu
        card={c}
        stages={movable(c) ? open : []}
        label={c.name}
        onMove={(to) => moveTo([c.id], to)}
      />
    ),
  });

  // A click on a card opens its pane without a navigation, unless the card was just dragged.
  // (Clicks on the name link itself are opened by PaneLinks before this runs.)
  const onClickCapture = (e: React.MouseEvent) => {
    const link = (e.target as Element).closest("a[data-card-link]");
    const li = (e.target as Element).closest("[data-card-id]");
    if (dragged.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Controls keep their own clicks (a checkbox also clicks its hidden input).
    const control = "button, input, label, [role=checkbox], [role=menuitem]";
    if (!li || (!link && (e.target as Element).closest(control))) return;
    e.preventDefault();
    e.stopPropagation();
    openPane(paneHref(li.getAttribute("data-card-id")!), router.refresh);
  };

  const shown = live.filter(
    (c) =>
      (filter === "all" || c.is[filter]) &&
      (!stageFilter || c.stageId === stageFilter) &&
      (!query || c.name.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const stageName = new Map(stages.map((s) => [s.id, s]));
  const counts = Object.fromEntries(
    FILTERS.map((f) => [
      f.id,
      f.id === "all" ? live.length : live.filter((c) => c.is[f.id]).length,
    ]),
  ) as Record<Filter, number>;

  return (
    <>
      {view === "board" ? (
        <DndContext
          id="hiring-board"
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={({ active }) => {
            dragged.current = true;
            setActiveId(String(active.id));
          }}
          onDragEnd={onDragEnd}
          onDragCancel={dropped}
        >
          <div
            role="region"
            aria-label="Pipeline by stage"
            tabIndex={0}
            onClickCapture={onClickCapture}
            className="-mx-4 overflow-x-auto px-4 pb-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:-mx-8 lg:px-8"
          >
            <div className="flex items-start gap-3">
              {stages.map((s) => {
                const here = live.filter((c) => c.stageId === s.id);
                return (
                  <Column
                    key={s.id}
                    stage={s}
                    cards={here}
                    onSelectAll={
                      canMove && !isOutcome(s)
                        ? () => setSelected((sel) => new Set([...sel, ...here.map((c) => c.id)]))
                        : undefined
                    }
                  >
                    {here.map((c) => (
                      <DraggableCard key={c.id} {...card(c)} canMove={canMove && !isOutcome(s)} />
                    ))}
                  </Column>
                );
              })}
            </div>
          </div>
          <DragOverlay>
            {activeId
              ? (() => {
                  const c = live.find((x) => x.id === activeId);
                  return c ? <CardBody card={c} open={false} overlay selecting={false} /> : null;
                })()
              : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={filter === f.id ? "secondary" : "ghost"}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="text-muted-foreground tabular-nums">{counts[f.id]}</span>
                </Button>
              ))}
            </div>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <select
                aria-label="Stage"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="h-8 rounded-lg border bg-background px-2 text-sm"
              >
                <option value="">All stages</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  aria-label="Search by name"
                  placeholder="Search by name"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-8 w-48 ps-8"
                />
              </div>
            </div>
          </div>
          <div
            className="overflow-x-auto rounded-xl border bg-card"
            onClickCapture={onClickCapture}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  {canMove && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all shown"
                        checked={
                          shown.some(movable) &&
                          shown.filter(movable).every((c) => selected.has(c.id))
                        }
                        onCheckedChange={(on) =>
                          setSelected(
                            on ? new Set(shown.filter(movable).map((c) => c.id)) : new Set(),
                          )
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead>Name</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Next</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((c) => {
                  const s = c.stageId ? stageName.get(c.stageId) : undefined;
                  return (
                    <TableRow
                      key={c.id}
                      data-card-id={c.id}
                      data-state={openId === c.id ? "selected" : undefined}
                      className="relative cursor-pointer"
                    >
                      {canMove && (
                        <TableCell className="relative z-10">
                          {movable(c) && (
                            <Checkbox
                              checked={selected.has(c.id)}
                              onCheckedChange={(on) => check(c.id, on === true)}
                              aria-label={`Select ${c.name}`}
                            />
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <Avatar size="sm">
                            <AvatarFallback>{c.initials}</AvatarFallback>
                          </Avatar>
                          <a
                            href={`?application=${c.id}`}
                            data-card-link
                            className="font-medium hover:underline"
                          >
                            {c.name}
                          </a>
                        </span>
                      </TableCell>
                      <TableCell>
                        {s && <StageChip name={s.name} category={s.category} />}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.applied.replace(/^Applied /, "")}
                      </TableCell>
                      <TableCell>
                        <Line line={c.line} />
                      </TableCell>
                      <TableCell className="relative z-10">{card(c).menu}</TableCell>
                    </TableRow>
                  );
                })}
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canMove ? 6 : 5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No one matches these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {canMove && selecting && (
        <BulkBar
          count={selected.size}
          stages={open}
          busy={busy}
          onMove={(to) => moveTo([...selected], to)}
          onClear={() => setSelected(new Set())}
        />
      )}
      {dialog}
    </>
  );
}
