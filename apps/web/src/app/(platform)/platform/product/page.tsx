import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { breadcrumbLd, JsonLd } from "../json-ld";
import { pageMetadata } from "../site";
import { MenuIcon } from "../_site/menu-icon";
import {
  BriefingMini,
  CLIENT_STEPS,
  FollowUpMini,
  PaymentMini,
  PersonMini,
  RecapMini,
  ScheduleMini,
  TimelineMini,
} from "../_site/minis";
import { CtaBand, Eyebrow, Headline, PageHero, Section, StartFree } from "../_site/ui";
import { WorksWith } from "../_site/works-with";
import type { MenuIcon as MenuIconName } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Product",
  description:
    "One client, every step connected: booking pages, a briefing before each call, consent-based transcription and recaps, follow-ups drafted from the recap, and payment requests through your own Stripe account.",
  path: "/product",
});

type Step = {
  id: string;
  icon: MenuIconName;
  name: string;
  line: string;
  journey: string;
  title: string;
  body: string;
  bullets: string[];
  mini: React.ReactNode;
};

const STEPS: Step[] = [
  {
    id: "booking",
    icon: "booking",
    name: "Booking",
    line: "Let clients book with ease.",
    journey: "01 Booked",
    title: "A booking page that fits how you work.",
    body: "Event types with their own length, questions, price and location; availability with buffers, notice and date overrides; your Google or Outlook calendar checked for conflicts.",
    bullets: [
      "Google Meet, Zoom, Microsoft Teams, phone, in person, or Bookly video (Pro and Team)",
      "Routing forms send people to the right event type",
      "Group sessions with seats and a waitlist, recurring series, round-robin on Team",
      "Your own domain with automatic HTTPS (Pro and Team)",
    ],
    mini: <ScheduleMini />,
  },
  {
    id: "briefing",
    icon: "briefing",
    name: "Briefing",
    line: "Capture the right context.",
    journey: "02 Prepared",
    title: "Walk in knowing who, why and what happened last.",
    body: "Before every call Bookly writes a briefing from the contact's timeline: earlier meetings and recaps, what they answered when booking, open tasks and the files you share. On every plan.",
    bullets: [
      "Written by the assistant when an AI key is set, a plain summary of the same facts when not",
      "Opens from the booking and from the contact",
      "Linked to the contact, so the whole history is one click away",
    ],
    mini: <BriefingMini />,
  },
  {
    id: "recap",
    icon: "recap",
    name: "Meeting recap",
    line: "Turn conversations into clarity.",
    journey: "03 Met",
    title: "The call ends. The context stays.",
    body: "With everyone's consent, Bookly transcribes the call on Bookly video, Google Meet, Zoom or Teams and shows a live notice while it does. Afterwards you get a recap: decisions, action items that quote the transcript, and your own notes from the call.",
    bullets: [
      "Consent is asked and recorded; any attendee can delete the transcript",
      "Transcripts expire on the retention period you set (90 days by default)",
      "Pro includes 5 meeting hours a month, Team 8 per member, pooled",
    ],
    mini: <RecapMini />,
  },
  {
    id: "follow-up",
    icon: "follow-up",
    name: "Follow-up",
    line: "Keep work on track.",
    journey: "04 Followed up",
    title: "The next email is already drafted.",
    body: "Action items become tasks in one click, and the follow-up email is drafted from the recap for you to edit and send. Replies come back to one conversation per client (Messages, in beta).",
    bullets: [
      "Tasks linked to the contact, with due dates",
      "Messages (beta): the client's emails in and out, plus internal notes",
      "Reminders and follow-ups by email, SMS or WhatsApp (Pro and Team)",
    ],
    mini: <FollowUpMini />,
  },
  {
    id: "payment",
    icon: "payment",
    name: "Payment request",
    line: "Get paid, without the back and forth.",
    journey: "05 Paid",
    title: "Paid work, in the same place as the conversation.",
    body: "Take payment when someone books, or send a payment request after the call. Money goes straight into your own Stripe account, and the payment lands on the client's timeline.",
    bullets: [
      "No platform fee on Pro and Team; 5% on Free",
      "Refunds on cancellation, Stripe invoices in your name (Pro and Team)",
      "Whole series paid in one checkout",
    ],
    mini: <PaymentMini />,
  },
];

export default function ProductPage() {
  return (
    <div>
      <JsonLd data={breadcrumbLd([["Product", "/product"]])} />
      <PageHero
        first="One client."
        second="Every step connected."
        lead="Everything you need to run client work, in one place. Less context switching. More time for what matters."
        note="A smoother client journey from start to finish."
        aside={
          <div className="relative grid gap-4 sm:grid-cols-2">
            <ScheduleMini className="sm:col-span-2 sm:ml-auto sm:w-[90%]" />
            <RecapMini />
            <PaymentMini />
          </div>
        }
      >
        <ol className="mt-8 space-y-1" aria-label="The client journey">
          {STEPS.map((s) => (
            <li key={s.id}>
              <Link
                href={`#${s.id}`}
                className="flex items-center gap-4 rounded-xl p-2 transition-colors hover:bg-accent/60"
              >
                <MenuIcon name={s.icon} className="size-10" />
                <span>
                  <span className="block font-semibold">{s.name}</span>
                  <span className="block text-sm text-muted-foreground">{s.line}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </PageHero>

      {STEPS.map((s, i) => (
        <Section
          key={s.id}
          id={s.id}
          labelledBy={`${s.id}-title`}
          className={i % 2 ? "" : "bg-sidebar/60"}
        >
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={`min-w-0 ${i % 2 ? "lg:order-2" : ""}`} data-reveal>
              <Eyebrow>{s.journey}</Eyebrow>
              <h2
                id={`${s.id}-title`}
                className="mt-3 text-3xl font-bold tracking-[-0.03em] text-balance md:text-4xl"
              >
                {s.title}
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
            </div>
            <div
              className={`mx-auto w-full max-w-md min-w-0 ${i % 2 ? "lg:order-1" : ""}`}
              data-reveal
              style={{ "--reveal-delay": "120ms" } as never}
            >
              {s.mini}
            </div>
          </div>
        </Section>
      ))}

      <Section labelledBy="hub-title">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <Eyebrow>The contact is the hub</Eyebrow>
            <Headline
              as="h2"
              id="hub-title"
              size="section"
              first="Every step lands"
              second="on the client."
              className="mt-3"
            />
            <p className="mt-4 text-muted-foreground">
              Bookings, briefings, recaps, messages, tasks, files and payments all link back to one
              contact page, with the journey from booked to paid at the top. Whoever takes the next
              call sees the whole relationship.
            </p>
            <StartFree className="mt-8" secondary={{ href: "/pricing", label: "See pricing" }} />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
            <TimelineMini steps={CLIENT_STEPS} />
            <PersonMini
              name="Maya Chen"
              role="Northstar Studio"
              counts={[
                ["Notes", "3"],
                ["Action items", "2"],
                ["Files", "4"],
                ["Invoices", "1"],
              ]}
            />
          </div>
        </div>
      </Section>

      <WorksWith />
      <CtaBand />
    </div>
  );
}
