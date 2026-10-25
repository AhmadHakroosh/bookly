import Link from "next/link";
import {
  ArrowRightIcon,
  BanknoteIcon,
  CalendarCheckIcon,
  CalendarIcon,
  CheckSquareIcon,
  FilePlusIcon,
  MessageSquareIcon,
  MicIcon,
  MonitorUpIcon,
  ReceiptIcon,
  UsersIcon,
  VideoOffIcon,
  ClockIcon,
  EllipsisIcon,
  FileTextIcon,
  InboxIcon,
  ListChecksIcon,
  PlusIcon,
  VideoIcon,
} from "lucide-react";
import { Agenda, AgendaItem } from "@/components/ui/agenda";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanList } from "@/components/ui/kanban";
import { Kbd } from "@/components/ui/kbd";
import { PageHeader } from "@/components/ui/page-header";
import { PaneHeader } from "@/components/ui/pane-header";
import { Progress } from "@/components/ui/progress";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { StatusChip } from "@/components/ui/status-chip";
import { ActionItem, ActionList } from "@/components/ui/action-list";
import { AttentionItem, AttentionStrip } from "@/components/ui/attention-strip";
import { CallControl, CallControls, VideoTile } from "@/components/ui/call-controls";
import { FileRow } from "@/components/ui/file-row";
import { CLIENT_JOURNEY, JourneyStrip } from "@/components/ui/journey-strip";
import { ListRow } from "@/components/ui/list-row";
import { RecapCard } from "@/components/ui/recap-card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Timeline, TimelineEntry } from "@/components/ui/timeline";
import { UsageBar } from "@/components/ui/usage-bar";
import { ChecklistDemo, CreateDemo } from "./client-demos";

export const metadata = { title: "Design", robots: { index: false } };

/* Made-up people for the previews; nobody real. */
const PANEL = [{ name: "Maya Chen" }, { name: "Jordan Rivera" }, { name: "Sam Okafor" }];
const MANY = [...PANEL, { name: "Priya Shah" }, { name: "Alex Morgan" }];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="rounded-xl border bg-background p-5">{children}</div>
    </section>
  );
}

/**
 * The v1.0 components (DESIGN.md) side by side, for visual review in light and dark and for
 * the axe scan. Operators only; nothing here reads workspace data.
 */
export default function DesignPage() {
  return (
    <div className="space-y-10">
      <p className="max-w-2xl text-sm text-muted-foreground">
        The admin&apos;s building blocks with sample content, light only like the app.
      </p>

      <Section title="Page header">
        <PageHeader
          title="2027 Horizon Fellowship"
          badge={
            <StatusChip tone="success" dot>
              Open
            </StatusChip>
          }
          description="Spring cohort · Applications close Nov 15"
          actions={
            <>
              <Button variant="outline">View application page</Button>
              <Button variant="ink">
                <PlusIcon data-icon="inline-start" />
                Add candidate
              </Button>
            </>
          }
        />
        <PageHeader
          className="mt-8 border-t pt-6"
          title="Good morning, Jordan."
          description="Tuesday, October 27 • Here's what needs your attention."
          actions={
            <>
              <Button variant="outline">View booking page</Button>
              <CreateDemo />
            </>
          }
        />
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="ink">Ink</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Status chips">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="success" dot>
            Open
          </StatusChip>
          <StatusChip tone="success" icon={<CheckSquareIcon />}>
            Intake ready
          </StatusChip>
          <StatusChip tone="accent">In 15 min</StatusChip>
          <StatusChip tone="info">New lead</StatusChip>
          <StatusChip tone="warning" dot>
            Due today
          </StatusChip>
          <StatusChip tone="destructive" dot>
            Feedback missing
          </StatusChip>
          <StatusChip>Draft</StatusChip>
        </div>
      </Section>

      <Section title="Stat strip">
        <StatStrip>
          <Stat icon={CalendarIcon} value={3} label="meetings today" href="/console/design" />
          <Stat icon={ListChecksIcon} value={2} label="follow-ups due" tone="warning" />
          <Stat icon={CheckSquareIcon} value={5} label="open tasks" />
        </StatStrip>
      </Section>

      <Section title="Agenda">
        <Agenda>
          <AgendaItem
            time="09:30"
            end="10:15"
            active
            title="Strategy session"
            badge={<StatusChip tone="accent">In 15 min</StatusChip>}
            subtitle="Maya Chen / Northstar project"
            meta={
              <>
                <span className="inline-flex items-center gap-1">
                  <VideoIcon className="size-3.5" aria-hidden /> Google Meet
                </span>
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="size-3.5" aria-hidden /> 45 min
                </span>
                <span className="inline-flex items-center gap-2">
                  <AvatarStack people={PANEL.slice(0, 2)} /> 2 people
                </span>
              </>
            }
            actions={
              <>
                <Button variant="ink" size="sm">
                  <VideoIcon data-icon="inline-start" />
                  Join meeting
                </Button>
                <Button variant="outline" size="sm">
                  <FileTextIcon data-icon="inline-start" />
                  Open briefing
                </Button>
              </>
            }
          >
            <div className="rounded-lg border bg-card p-3 text-sm">
              <p className="font-medium">Pick up where you left off</p>
              <ul className="mt-1 list-disc ps-5 text-muted-foreground">
                <li>Review the revised positioning</li>
                <li>Proposal shared Friday, awaiting feedback</li>
              </ul>
            </div>
          </AgendaItem>
          <AgendaItem
            time="11:00"
            end="11:30"
            title="Discovery call"
            badge={<StatusChip tone="info">New lead</StatusChip>}
            subtitle="Alex Morgan / Morgan & Co."
            actions={
              <Button variant="outline" size="sm">
                View intake
              </Button>
            }
          />
        </Agenda>
      </Section>

      <Section title="Kanban">
        <KanbanBoard>
          {[
            { title: "Applied", people: ["Jordan Lee", "Priya Nair"], note: "Review assigned" },
            { title: "In review", people: ["Marcus Green"], note: "2 of 3 reviews submitted" },
            { title: "Interview", people: ["Maya Chen"], note: "Interview Tue 10:00" },
          ].map((col, i) => (
            <KanbanColumn
              key={col.title}
              title={col.title}
              count={col.people.length}
              actions={
                <Button variant="ghost" size="icon-xs" aria-label={`${col.title} options`}>
                  <EllipsisIcon />
                </Button>
              }
            >
              <KanbanList>
                {col.people.map((name) => (
                  <li key={name}>
                    <KanbanCard selected={i === 2}>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                            {name
                              .split(" ")
                              .map((w) => w[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{name}</p>
                          <p className="text-xs text-muted-foreground">Applied Oct 12</p>
                        </div>
                      </div>
                      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarIcon className="size-3.5" aria-hidden />
                        {col.note}
                      </p>
                    </KanbanCard>
                  </li>
                ))}
              </KanbanList>
            </KanbanColumn>
          ))}
        </KanbanBoard>
      </Section>

      <Section title="Side pane header">
        <div className="max-w-xl rounded-xl border bg-popover p-5">
          <PaneHeader
            media={
              <Avatar size="lg" className="size-14">
                <AvatarFallback className="bg-accent text-base font-semibold text-accent-foreground">
                  MC
                </AvatarFallback>
              </Avatar>
            }
            title="Maya Chen"
            subtitle="Application · 2027 Fellowship"
            status={<StatusChip tone="accent">Interview</StatusChip>}
            actions={
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <EllipsisIcon />
              </Button>
            }
          />
        </div>
      </Section>

      <Section title="Avatar stack and progress">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <AvatarStack people={PANEL} size="default" /> 3 interviewers
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <AvatarStack people={MANY} size="default" /> Review panel
          </div>
          <Progress
            label="Structured review progress"
            value={2}
            max={3}
            valueText="2 of 3 submitted"
            showValue
          />
          <Progress label="Seats used" value={3} max={5} valueText="3 of 5 seats" showValue />
        </div>
      </Section>

      <Section title="Empty states">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <EmptyState
            icon={InboxIcon}
            title="No messages yet"
            description="When a client replies to a booking email, the conversation starts here."
            action={<Button>New message</Button>}
          />
          <EmptyState
            size="sm"
            icon={CalendarIcon}
            title="No meetings today."
            description="New bookings show up here on the day."
          />
        </div>
      </Section>

      <Section title="Segmented tabs">
        <SegmentedTabs
          label="Bookings view"
          items={[
            { href: "/console/design", label: "Upcoming", count: 4, active: true },
            { href: "/console/design?past", label: "Past" },
            { href: "/console/design?requests", label: "Requests", count: 1 },
          ]}
        />
      </Section>

      <Section title="Journey strip">
        <JourneyStrip
          steps={CLIENT_JOURNEY.map((label, i) => ({
            label,
            state: i < 2 ? "done" : i === 2 ? "current" : "todo",
            detail: ["Apr 12", "Briefing ready", "Today 11:00", undefined, undefined][i],
          }))}
        />
      </Section>

      <Section title="Timeline and next actions">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_16rem]">
          <Timeline>
            <TimelineEntry
              icon={CalendarCheckIcon}
              tone="brand"
              time="Today, Apr 16 · 11:00 AM"
              title="Booking scheduled"
              action={
                <Link href="/console/design" className="text-primary hover:underline">
                  View
                </Link>
              }
            >
              Strategy session (1 hr)
            </TimelineEntry>
            <TimelineEntry
              icon={MessageSquareIcon}
              tone="info"
              time="Apr 12, 2:14 PM"
              title="Message from Maya"
            >
              Re: Brand direction
            </TimelineEntry>
            <TimelineEntry
              icon={BanknoteIcon}
              tone="success"
              time="Apr 8, 11:20 AM"
              title="Payment request"
              action={
                <StatusChip tone="success" dot>
                  Paid
                </StatusChip>
              }
            >
              $2,500 · Proposal deposit
            </TimelineEntry>
          </Timeline>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Next actions</p>
            <ActionList>
              <ActionItem icon={FilePlusIcon} href="/console/design" suggested>
                Create proposal
              </ActionItem>
              <ActionItem icon={ReceiptIcon} href="/console/design">
                Send payment request
              </ActionItem>
              <ActionItem icon={CalendarIcon} href="/console/design">
                Add follow-up
              </ActionItem>
            </ActionList>
          </div>
        </div>
      </Section>

      <Section title="Checklist, rows and files">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <ChecklistDemo />
          <div>
            <ListRow
              name="Maya Chen"
              subtitle="Re: Northstar project"
              preview="This looks great, thanks! I've added a few notes on the timeline."
              meta="9:14 AM"
              unread
              href="/console/design"
            />
            <ListRow
              name="Priya Shah"
              subtitle="Proposal awaiting reply"
              preview="4 days"
              href="/console/design"
              actions={
                <Button variant="outline" size="sm">
                  Draft follow-up
                </Button>
              }
            />
            <div className="mt-3 divide-y border-t">
              <FileRow name="proposal.pdf" href="/console/design" meta="Maya Chen" date="Apr 12" />
              <FileRow
                name="workshop-notes.docx"
                href="/console/design"
                meta="Olivia Park"
                date="Apr 10"
              />
              <FileRow
                name="timeline.xlsx"
                href="/console/design"
                meta="Jordan Patel"
                date="Apr 8"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Needs attention and recap">
        <div className="space-y-4">
          <AttentionStrip>
            <AttentionItem
              icon={CalendarIcon}
              title="Panel feedback due today"
              detail="2 candidates with pending feedback"
              action={{ label: "View candidates", href: "/console/design" }}
            />
            <AttentionItem
              icon={UsersIcon}
              title="3 candidates awaiting scheduling"
              detail="Move to interview stage"
              action={{ label: "View candidates", href: "/console/design" }}
            />
          </AttentionStrip>
          <RecapCard
            title="Yesterday's call with Maya"
            meta="3 decisions • 2 action items"
            action={
              <Button>
                Review recap
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            }
          />
        </div>
      </Section>

      <Section title="Plan usage">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <UsageBar label="Team members" used={3} limit={5} />
          <UsageBar label="Event types" used={10} limit={10} />
          <UsageBar label="Bookings this month" used={128} limit={500} />
        </div>
      </Section>

      <Section title="Video and call controls">
        <div className="space-y-4">
          <div className="grid max-w-xl grid-cols-2 gap-3">
            <VideoTile name="Jordan Lee" />
            <VideoTile name="Taylor Kim" />
          </div>
          <CallControls className="max-w-xl">
            <CallControl icon={MicIcon} label="Mute" />
            <CallControl icon={VideoOffIcon} label="Stop video" pressed />
            <CallControl icon={MonitorUpIcon} label="Share" />
            <CallControl icon={EllipsisIcon} label="More" />
            <CallControl label="End" tone="end" />
          </CallControls>
        </div>
      </Section>

      <Section title="Keys">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> search or jump · <Kbd>J</Kbd> <Kbd>K</Kbd> next and previous in a pane ·{" "}
          <Kbd>Esc</Kbd> close
        </p>
      </Section>
    </div>
  );
}
