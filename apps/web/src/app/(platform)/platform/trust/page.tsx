import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  DatabaseIcon,
  DownloadIcon,
  LockKeyholeIcon,
  ServerIcon,
  SparklesIcon,
  UserRoundCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { breadcrumbLd, faqLd, JsonLd } from "../json-ld";
import { pageMetadata, SITE } from "../site";
import { LayersMini } from "../_site/minis";
import { CtaBand, Eyebrow, PageHero, Section, StraightAnswers } from "../_site/ui";

export const metadata: Metadata = pageMetadata({
  title: "Trust & ownership",
  description:
    "Your relationships, your data, your choice: consent before any transcript, retention you set, export any time, optional AI that is never trained on your data, and Bookly hosted or on your own servers.",
  path: "/trust",
});

const CARDS: { icon: LucideIcon; title: string; body: string; href: string; link: string }[] = [
  {
    icon: LockKeyholeIcon,
    title: "Your consent",
    body: "No call is transcribed without consent. Attendees are asked, everyone sees a live notice while it runs, and the consent is recorded with the meeting.",
    href: "/security#transcripts-and-consent",
    link: "How consent works",
  },
  {
    icon: DatabaseIcon,
    title: "Data retention",
    body: "Set how long transcripts and recaps are kept (90 days by default). Any attendee can delete a transcript, and a deleted workspace is gone from backups after 30 days.",
    href: "/privacy#how-long-we-keep-it",
    link: "What we keep, and for how long",
  },
  {
    icon: DownloadIcon,
    title: "Export anytime",
    body: "Download the whole workspace as JSON from Settings: contacts, bookings, timelines, messages and forms. No ticket, no waiting.",
    href: "/docs/self-hosting",
    link: "Move to your own server",
  },
  {
    icon: SparklesIcon,
    title: "Optional AI",
    body: "AI features are optional. Your content is never used to train models, by us or by the model provider.",
    href: "#ai",
    link: "AI transparency",
  },
  {
    icon: ServerIcon,
    title: "Hosted or self-hosted",
    body: "Run Bookly in our cloud, or on your own infrastructure with docker compose up and no third-party accounts.",
    href: "/docs/self-hosting",
    link: "Self-hosting guide",
  },
];

const AI_FACTS: [string, string][] = [
  [
    "What the AI does",
    "It writes the briefing before a call from the contact's timeline, the recap after it from the transcript and your notes, and drafts of tasks and follow-up emails. You review and send everything yourself.",
  ],
  [
    "Who runs the model",
    "On Bookly's cloud, Anthropic's Claude, under Anthropic's commercial terms: the text is processed to answer the request and not used for training. Self-hosters choose their own provider with their own key, or none.",
  ],
  [
    "Without AI",
    "Bookly works without a model key. Briefings become a plain summary of the same facts, so nothing depends on the model.",
  ],
  [
    "Traceable",
    "Every action item in a recap quotes the conversation and says whether it came from the transcript, your notes or both.",
  ],
  [
    "Hiring",
    "When hiring arrives in Bookly 1.0, AI may summarise and draft, and never ranks, scores, rejects or recommends a decision about a person. People decide, and every decision records who made it.",
  ],
];

const FAQ: [string, string][] = [
  [
    "Who owns the data in my workspace?",
    "You do. Bookly processes it on your behalf under the data processing agreement, never sells it, never shows advertising, and gives it back as a full export whenever you ask.",
  ],
  [
    "Is Bookly open source?",
    "The core is: AGPL-3.0, on GitHub, and it runs complete on your own server. Enterprise modules are source-available under the Elastic License 2.0, so every line that runs is published.",
  ],
  [
    "Where is my data stored?",
    "On Bookly's cloud, data is processed in the United States; the data processing agreement lists every sub-processor and where it runs. If you need it somewhere else, self-host it where you like.",
  ],
  [
    "Can guests delete what Bookly holds about them?",
    "Yes. Guests manage or cancel a booking from their confirmation email, any attendee can delete a transcript, and anyone can ask for access or deletion at the support address.",
  ],
];

export default function TrustPage() {
  return (
    <div>
      <JsonLd data={[breadcrumbLd([["Trust & ownership", "/trust"]]), faqLd(FAQ)]} />
      <PageHero
        first="Your relationships."
        second="Your data. Your choice."
        lead="Bookly is built on a simple principle: you own your client relationships and your data. We give you the tools, transparency and flexibility to keep it that way."
        aside={<LayersMini className="mx-auto w-full max-w-md text-foreground" />}
      />

      <Section className="pt-6 md:pt-8" labelledBy="principles">
        <h2 id="principles" className="sr-only">
          What that means in practice
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {CARDS.map((c, i) => (
            <li
              key={c.title}
              className={`flex flex-col rounded-2xl border bg-card p-6 ${i < 3 ? "lg:col-span-2" : "lg:col-span-3"}`}
            >
              <c.icon className="size-6 text-(--brand)" aria-hidden />
              <h3 className="mt-4 text-lg font-bold tracking-tight">{c.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{c.body}</p>
              <Link
                href={c.href}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                {c.link}
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="ai" labelledBy="ai-title" className="bg-sidebar/60">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <Eyebrow>AI transparency</Eyebrow>
            <h2 id="ai-title" className="mt-3 text-3xl font-bold tracking-[-0.03em] md:text-4xl">
              A helper, with you in charge.
            </h2>
            <p className="mt-4 text-muted-foreground">
              What Bookly&apos;s AI does, who runs it, and what it never does. The{" "}
              <Link href="/privacy" className="font-medium text-primary hover:underline">
                privacy policy
              </Link>{" "}
              and{" "}
              <Link href="/dpa#sub-processors" className="font-medium text-primary hover:underline">
                sub-processor list
              </Link>{" "}
              are the binding versions.
            </p>
          </div>
          <dl className="divide-y rounded-2xl border bg-card">
            {AI_FACTS.map(([term, text]) => (
              <div key={term} className="grid gap-1 p-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
                <dt className="font-semibold">{term}</dt>
                <dd className="text-sm text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section labelledBy="open-core-title">
        <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 md:flex-row md:items-center md:p-8">
          <UserRoundCheckIcon className="size-8 shrink-0 text-(--brand)" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="open-core-title" className="text-xl font-bold tracking-tight">
              Open core, fair cloud.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The core is open source under AGPL-3.0: read it, run it, change it. Our cloud charges
              for running Bookly well, not for locking anyone in.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-4 text-sm font-semibold">
            <a
              href={SITE.github}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Source on GitHub
            </a>
            <Link href="/security" className="text-primary hover:underline">
              Security
            </Link>
          </div>
        </div>
      </Section>

      <StraightAnswers items={FAQ} />
      <CtaBand />
    </div>
  );
}
