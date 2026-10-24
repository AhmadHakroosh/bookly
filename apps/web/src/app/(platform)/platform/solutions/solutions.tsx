import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CheckIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  GraduationCapIcon,
  MailIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  ReceiptIcon,
  SplitIcon,
  UsersIcon,
} from "lucide-react";
import { breadcrumbLd, faqLd, JsonLd } from "../json-ld";
import { pageMetadata } from "../site";
import {
  CLIENT_STEPS,
  HIRING_STEPS,
  PersonMini,
  TimelineMini,
  type TimelineStep,
} from "../_site/minis";
import { CtaBand, Eyebrow, PageHero, Section, StartFree, StraightAnswers } from "../_site/ui";

/**
 * Solutions (concept-fidelity §6): "Built around the way you work." with one tab per audience.
 * Each tab is its own URL (Consultants at /solutions, the rest at /solutions/<slug>) so menus,
 * search engines and shared links land on the right one; the tabs are links, not a widget.
 */

export type Solution = {
  slug: string;
  label: string;
  eyebrow: string;
  first: string;
  second: string;
  body: string;
  bullets: string[];
  link: { href: string; label: string };
  timeline: { title: string; steps: TimelineStep[] };
  person: { name: string; role: string; counts: [string, string][] };
  /** Hiring and programs are in development: the page says so. */
  coming?: boolean;
  description: string;
};

export const SOLUTIONS: Solution[] = [
  {
    slug: "consultants",
    label: "Consultants",
    eyebrow: "For consultants",
    first: "Turn expertise",
    second: "into progress.",
    body: "Give clients a simple way to book, share context, meet and take action, so you can focus on the work, not the admin.",
    bullets: [
      "Intake questions on the booking page land in the briefing",
      "Recaps with decisions and action items after every call",
      "The proposal goes out with the follow-up, while the call is fresh",
      "Paid bookings and payment requests through your own Stripe account",
    ],
    link: { href: "/product", label: "Explore consultant features" },
    timeline: { title: "Client timeline", steps: CLIENT_STEPS },
    person: {
      name: "Jordan Lee",
      role: "Strategy Consultant",
      counts: [
        ["Notes", "3"],
        ["Action items", "2"],
        ["Files", "4"],
        ["Invoices", "1"],
      ],
    },
    description:
      "Bookly for consultants: a booking page with intake questions, a briefing before every call, recaps and follow-ups after, and payment requests through your own Stripe account.",
  },
  {
    slug: "coaches",
    label: "Coaches",
    eyebrow: "For coaches",
    first: "Sessions that",
    second: "build on each other.",
    body: "Recurring series, notes from every session and a briefing before the next one. Clients book and pay for the whole series in one go, and nothing said in session three is lost by session four.",
    bullets: [
      "One booking reserves a whole series, each session with its own link and reminders",
      "A briefing before every session, from the last recap and your notes",
      "Group sessions with seats and a waitlist for workshops",
      "Reminders by email, SMS or WhatsApp (Pro and Team)",
    ],
    link: { href: "/product#briefing", label: "Explore coaching features" },
    timeline: {
      title: "Client timeline",
      steps: [
        {
          title: "Series booked",
          when: "6 sessions · paid in one checkout",
          icon: CalendarCheckIcon,
        },
        { title: "Briefing for session 3", when: "Last time: goals for Q1", icon: FileTextIcon },
        { title: "Notes captured", when: "2 moments marked", icon: NotebookPenIcon },
        { title: "Follow-up sent", when: "Exercises for next week", icon: MailIcon },
        {
          title: "Session 4 booked",
          when: "Reminder the day before",
          icon: CalendarCheckIcon,
          done: false,
        },
      ],
    },
    person: {
      name: "Priya Shah",
      role: "Leadership coach",
      counts: [
        ["Sessions", "6"],
        ["Notes", "5"],
        ["Tasks", "2"],
        ["Payments", "1"],
      ],
    },
    description:
      "Bookly for coaches: recurring series paid in one checkout, notes from every session, a briefing before the next one, and reminders that land.",
  },
  {
    slug: "agencies",
    label: "Agencies",
    eyebrow: "For agencies",
    first: "From discovery call",
    second: "to paid proposal.",
    body: "Routing forms send each lead to the right person, briefings carry the context into the call, and the proposal follows while the conversation is fresh. Everyone on the account sees the same history.",
    bullets: [
      "Routing forms: two questions, the right person or event type",
      "Round-robin and collective events across the team (Team)",
      "HubSpot and Pipedrive sync for contacts and stages (Pro and Team)",
      "Your domain, logo and colours on booking pages and emails",
    ],
    link: { href: "/product#follow-up", label: "Explore agency features" },
    timeline: {
      title: "Client timeline",
      steps: [
        { title: "Lead routed to Sam", when: "Routing form · brand project", icon: SplitIcon },
        {
          title: "Discovery call booked",
          when: "Collective: Sam and Ana",
          icon: CalendarCheckIcon,
        },
        { title: "Recap ready", when: "3 decisions · 2 action items", icon: ClipboardCheckIcon },
        { title: "Proposal sent", when: "With the follow-up email", icon: MailIcon },
        { title: "Deposit paid", when: "Into your Stripe account", icon: ReceiptIcon },
      ],
    },
    person: {
      name: "Leo Martins",
      role: "Brightline Co.",
      counts: [
        ["Calls", "2"],
        ["Action items", "4"],
        ["Files", "6"],
        ["Payments", "1"],
      ],
    },
    description:
      "Bookly for agencies: routing forms for leads, collective and round-robin calls, briefings and recaps, proposals sent with the follow-up, and HubSpot or Pipedrive sync.",
  },
  {
    slug: "teams",
    label: "Teams",
    eyebrow: "For teams",
    first: "One memory",
    second: "for every client.",
    body: "Everyone sees the same contacts, timelines and briefings, so whoever takes the next call knows the whole history. Round-robin and collective events share the work, and every follow-up lands on the same client.",
    bullets: [
      "2 to 25 members, priced per member",
      "Internal notes and @-mentions the client never sees (Messages, in beta)",
      "Tasks assigned to teammates, and folders shared with the team (beta)",
      "Activity log kept for two years",
    ],
    link: { href: "/pricing", label: "See the Team plan" },
    timeline: {
      title: "Client timeline",
      steps: [
        { title: "Booked with Ana", when: "Round-robin · sales call", icon: CalendarCheckIcon },
        { title: "Handover briefing", when: "Sam's notes from last month", icon: FileTextIcon },
        { title: "Internal note", when: "@Sam: pricing question", icon: MessageSquareIcon },
        { title: "Follow-up sent", when: "Drafted from the recap", icon: MailIcon },
        { title: "Invoice paid", when: "Stripe invoice in your name", icon: ReceiptIcon },
      ],
    },
    person: {
      name: "Northwind Labs",
      role: "Client of the team",
      counts: [
        ["People", "3"],
        ["Bookings", "7"],
        ["Tasks", "5"],
        ["Files", "9"],
      ],
    },
    description:
      "Bookly for teams: one shared memory of every client, round-robin and collective events, internal notes, assigned tasks and shared folders, from 2 to 25 members.",
  },
  {
    slug: "hiring",
    label: "Hiring",
    eyebrow: "For hiring · coming in Bookly 1.0",
    first: "Every applicant heard.",
    second: "Every decision clear.",
    body: "Jobs and internships on the same platform as your client work: an application page, a pipeline you define, independent reviews, interviews booked on your calendars, and a decision with a name and a reason on it. AI summarises; people decide.",
    bullets: [
      "Every applicant gets a confirmation and a status they can check",
      "Reviewers don't see each other's feedback until they submit their own",
      "Interviews are bookings: panels, self-scheduling links, Bookly video",
      "No scores that rank people, and nothing is rejected automatically",
    ],
    link: { href: "/compare/greenhouse", label: "Compare with Greenhouse and Ashby" },
    timeline: { title: "Application timeline", steps: HIRING_STEPS },
    person: {
      name: "Amara Okafor",
      role: "Product designer · applicant",
      counts: [
        ["Documents", "3"],
        ["Reviews", "2 of 3"],
        ["Interviews", "1"],
        ["Status", "Interview"],
      ],
    },
    coming: true,
    description:
      "Hiring on Bookly (coming in 1.0): application pages, pipelines you define, independent reviews, interviews on your calendars and decisions people own. Every applicant heard. Every decision clear.",
  },
  {
    slug: "programs",
    label: "Programs & cohorts",
    eyebrow: "For programs & cohorts · coming in Bookly 1.0",
    first: "From application",
    second: "to cohort, in one place.",
    body: "Fellowships, accelerators, internships, scholarships and admissions: open an intake round, collect applications and documents, review against a shared scorecard, run info sessions and assessment days with seats, and decide in batches at a decision meeting.",
    bullets: [
      "Stages and the modules on each one are yours to choose per round",
      "Info sessions and assessment days as group sessions with seats",
      "Batch decisions, each one recorded with who made it",
      "Data of people not admitted deleted after the cycle (6 months by default, adjustable)",
    ],
    link: { href: "/compare/submittable", label: "Compare with Submittable" },
    timeline: {
      title: "Intake timeline",
      steps: [
        {
          title: "Applications open",
          when: "Spring cohort · closes Nov 15",
          icon: GraduationCapIcon,
        },
        {
          title: "Reviews assigned",
          when: "3 reviewers per application",
          icon: ClipboardCheckIcon,
        },
        { title: "Assessment day", when: "24 seats · 2 sessions", icon: UsersIcon },
        { title: "Decision meeting", when: "Friday · batch decisions", icon: CheckIcon },
        {
          title: "Cohort admitted",
          when: "Waitlist told the same day",
          icon: MailIcon,
          done: false,
        },
      ],
    },
    person: {
      name: "Horizon Fellowship",
      role: "2027 · Spring cohort",
      counts: [
        ["Applications", "124"],
        ["Reviews pending", "8"],
        ["Interviews", "6"],
        ["Seats", "20"],
      ],
    },
    coming: true,
    description:
      "Programs and cohorts on Bookly (coming in 1.0): intake rounds, applications with documents, shared scorecards, assessment days with seats and batch decisions.",
  },
];

const FAQ: [string, string][] = [
  [
    "Can one workspace run client work and hiring?",
    "Yes, from Bookly 1.0. A workspace turns on one solution or both; with both, a switch in the sidebar moves between Clients and Hiring, and Messages, Files, Team and Settings stay shared. A candidate is a contact, and an interview is a booking.",
  ],
  [
    "When does hiring arrive?",
    "With Bookly 1.0. The data model is in place and the screens are being built now; programs and cohorts come first, jobs follow on the same model. Talk to us if you want to join the design-partner group.",
  ],
  [
    "Does AI decide who gets hired or admitted?",
    "No. AI may summarise an application or draft a message; it never ranks, scores, rejects or recommends a decision about a person. Every decision is made and recorded by a person, with a reason.",
  ],
  [
    "Which plan do I need?",
    "Free covers one person with a booking page, contacts and briefings. Pro adds recaps, Bookly video and your own domain; Team shares everything across 2 to 25 members. See the pricing page for the full list.",
  ],
];

export function solutionMetadata(s: Solution) {
  return pageMetadata({
    title: s.slug === "consultants" ? "Solutions" : `${s.label} — Solutions`,
    description: s.description,
    path: s.slug === "consultants" ? "/solutions" : `/solutions/${s.slug}`,
  });
}

const href = (slug: string) => (slug === "consultants" ? "/solutions" : `/solutions/${slug}`);

export function SolutionsPage({ slug }: { slug: string }) {
  const s = SOLUTIONS.find((x) => x.slug === slug);
  if (!s) notFound();
  return (
    <div>
      <JsonLd
        data={[
          breadcrumbLd(
            s.slug === "consultants"
              ? [["Solutions", "/solutions"]]
              : [
                  ["Solutions", "/solutions"],
                  [s.label, href(s.slug)],
                ],
          ),
          faqLd(FAQ),
        ]}
      />
      <PageHero
        first="Built around"
        second="the way you work."
        lead="Flexible tools for different ways of working, with the same connected journey for every client, applicant and cohort."
      />
      <Section className="pt-4 md:pt-6" labelledBy="solution-title">
        <nav aria-label="Solutions by audience" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-1 border-b">
            {SOLUTIONS.map((x) => {
              const active = x.slug === s.slug;
              return (
                <li key={x.slug}>
                  <Link
                    href={href(x.slug)}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`relative inline-flex h-11 items-center px-4 text-sm font-medium transition-colors ${active ? "text-primary after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-(--brand)" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {x.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-14">
          <div className="min-w-0">
            <Eyebrow>{s.eyebrow}</Eyebrow>
            <h2
              id="solution-title"
              className="mt-3 text-3xl leading-[1.05] font-bold tracking-[-0.03em] text-balance md:text-[2.6rem]"
            >
              <span className="block">{s.first}</span>
              <span className="block">{s.second}</span>
            </h2>
            <p className="mt-4 text-muted-foreground">{s.body}</p>
            <ul className="mt-6 space-y-2 text-sm">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-(--brand)" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
            {s.coming ? (
              <p className="mt-6 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
                Hiring is in development and arrives with Bookly 1.0. Running a fellowship, cohort
                or hiring round next year?{" "}
                <Link href="/contact" className="font-medium text-primary hover:underline">
                  Join the design partners
                </Link>
                .
              </p>
            ) : (
              <StartFree className="mt-8" />
            )}
            <Link
              href={s.link.href}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              {s.link.label}
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1.35fr_1fr]">
            <TimelineMini title={s.timeline.title} steps={s.timeline.steps} />
            <PersonMini {...s.person} />
          </div>
        </div>
      </Section>
      <StraightAnswers items={FAQ} />
      <CtaBand />
    </div>
  );
}
