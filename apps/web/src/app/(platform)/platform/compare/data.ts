import { monthlyEquivalent, PLANS } from "@bookly/cloud";

/**
 * The comparison pages (concept-fidelity §6, the Sam site's pattern): dated facts about the
 * other product, each with the page it came from, and where they are ahead today. Read from the
 * vendors' own pages; nothing here is a guess. Update `verified` with every re-read.
 */

export type Row = {
  feature: string;
  bookly: string;
  them: string;
  /** The vendor page the claim about them comes from. */
  source?: string;
};

export type Comparison = {
  slug: string;
  name: string;
  group: "scheduling" | "hiring";
  /** One line for the index and the footer of other pages. */
  summary: string;
  first: string;
  second: string;
  lead: string;
  booklyIs: string;
  themIs: string;
  chooseBookly: string[];
  chooseThem: string[];
  rows: Row[];
  ahead: string[];
  faq: [string, string][];
  sources: string[];
  verified: string;
};

const pro = PLANS.pro;
const team = PLANS.team;
const BOOKLY_PRICE = `Free; Pro $${pro.priceMonthly} a month ($${monthlyEquivalent(pro, "year")} billed yearly); Team $${team.priceMonthly} a member ($${monthlyEquivalent(team, "year")} billed yearly)`;
const BOOKLY_SELF_HOST =
  "Yes: open-source core under AGPL-3.0, Docker Compose, no plan limits; enterprise modules need a license key";
const BOOKLY_RECAPS = `Transcription with consent on Bookly video, Google Meet, Zoom and Teams; a recap with decisions and action items. Pro includes 5 hours a month, Team 8 per member, pooled`;
const BOOKLY_PAYMENTS = `Stripe, into your own account; no platform fee on Pro and Team, ${PLANS.free.feePercent}% on Free; payment requests after the call`;
const COMING = "Coming in Bookly 1.0";
const BETA = "In beta, by invitation";

const VERIFIED = "2026-10-25";

const figures = (vendor: string): [string, string] => [
  "Where are the figures from?",
  `From ${vendor}'s own pages, read on ${VERIFIED} and linked beside each claim. Prices and plans change; if something here is out of date, write to us and we will correct it.`,
];

export const COMPARISONS: Comparison[] = [
  {
    slug: "calendly",
    name: "Calendly",
    group: "scheduling",
    summary: "A booking link, or the whole client journey.",
    first: "Bookly vs Calendly:",
    second: "A booking link, or the whole client journey.",
    lead: "Calendly is the best-known scheduler, and it now records calls and takes payments too. Bookly starts at the booking and keeps the client, the conversation and the next step in one place, with an open-source core you can run yourself. Where each one wins.",
    booklyIs:
      "Bookly is a workspace for client work: booking pages, a briefing before every call, transcription with consent and recaps, follow-ups, payment requests, and one contact page that ties them together. Hosted, or on your own server.",
    themIs:
      "Calendly is a hosted scheduling platform with booking pages. It has added an AI notetaker, contact profiles, payments and an AI assistant in beta, with 150+ integrations.",
    chooseBookly: [
      "you want the client, the conversation and the payment in one place, not only the meeting",
      "you want a briefing before every call, on the free plan too",
      "you want video rooms of your own that nobody needs an account for",
      "you want to self-host, or keep that option open",
    ],
    chooseThem: [
      "you need the widest set of integrations today",
      "your company already standardises on it, with SCIM and enterprise support",
      "you sell meeting packages or take PayPal at checkout",
      "you only need scheduling and want the link most invitees already know",
    ],
    rows: [
      {
        feature: "What it is",
        bookly: "A connected workspace for client work, starting at the booking",
        them: "A hosted scheduling platform with an AI notetaker, contacts and payments",
        source: "https://calendly.com/pricing",
      },
      {
        feature: "Price per person",
        bookly: BOOKLY_PRICE,
        them: "Free; Standard $12 ($10 annual); Standard Plus $24 ($18); Teams $20 ($16); Teams Plus $32 ($24); Enterprise from $15k a year",
        source: "https://calendly.com/pricing",
      },
      {
        feature: "Free plan",
        bookly: `A booking page, ${PLANS.free.limits.eventTypes} event types, 1 connected account, contacts, briefings and paid bookings`,
        them: "1 calendar connection, unlimited one-on-one meetings and contact profiles; no payments or routing",
        source: "https://calendly.com/pricing",
      },
      {
        feature: "Notes and recaps",
        bookly: BOOKLY_RECAPS,
        them: "AI Notetaker on Zoom, Meet and Teams: recap, transcript and follow-up drafts; unlimited on Standard Plus and Teams Plus, limited on other plans; English accounts only",
        source: "https://calendly.com/notetaker",
      },
      {
        feature: "Briefing before the call",
        bookly: "On every plan, from the contact's history",
        them: "Not listed on the pages we read",
      },
      {
        feature: "Video",
        bookly: "Bookly video built in (Pro and Team), or Google Meet, Zoom and Teams",
        them: "Zoom, Google Meet, Microsoft Teams and other video tools",
        source: "https://calendly.com/pricing",
      },
      {
        feature: "Contacts",
        bookly: "A page per client: journey, timeline, bookings, tasks and files",
        them: "Contact profiles with history, notes, reminders, custom fields and lists",
        source: "https://calendly.com/pricing",
      },
      {
        feature: "Payments",
        bookly: BOOKLY_PAYMENTS,
        them: "Stripe and PayPal, payment links, packages and invoices on Standard and up, with no Calendly fee",
        source: "https://calendly.com/payments",
      },
      {
        feature: "Routing forms",
        bookly: "Every plan",
        them: "Teams and up",
        source: "https://calendly.com/pricing",
      },
      {
        feature: "Round-robin",
        bookly: "Team",
        them: "Teams and up",
        source: "https://calendly.com/pricing",
      },
      {
        feature: "API and webhooks",
        bookly: "REST API, signed webhooks and an OpenAPI spec (Pro and Team)",
        them: "Webhooks on Standard and up; a public API",
        source: "https://developer.calendly.com/",
      },
      {
        feature: "Self-hosting",
        bookly: BOOKLY_SELF_HOST,
        them: "None listed",
      },
    ],
    ahead: [
      "Scale: 20 million professionals and 150+ integrations, by Calendly's own count.",
      "Breadth in one product: scheduling, an AI notetaker, contacts, payments with packages and invoices, and an AI assistant.",
      "Enterprise readiness: SCIM, a data deletion API, phone support and dedicated onboarding.",
    ],
    faq: [
      [
        "Can I move from Calendly to Bookly?",
        "Yes. Create your event types and availability in Bookly, connect the same Google or Microsoft calendar so existing meetings count as busy, and share your new booking link. There is no automatic importer today.",
      ],
      [
        "Does Bookly record calls like Calendly's Notetaker?",
        "Bookly transcribes calls only with consent, shows a live notice, and keeps the transcript for the retention period you set. The recap lands on the contact with the rest of the relationship.",
      ],
      figures("Calendly"),
    ],
    sources: [
      "https://calendly.com/pricing",
      "https://calendly.com/notetaker",
      "https://calendly.com/payments",
      "https://developer.calendly.com/",
    ],
    verified: VERIFIED,
  },
  {
    slug: "cal-com",
    name: "Cal.com",
    group: "scheduling",
    summary: "Scheduling, and what happens after it.",
    first: "Bookly vs Cal.com:",
    second: "Scheduling, and what happens after it.",
    lead: "Cal.com is a capable scheduler with built-in video and a generous free tier. In April 2026 it moved its commercial product to closed source. Bookly keeps an open-source core and adds what happens around the call: briefings, recaps, follow-ups and the client's whole history.",
    booklyIs:
      "Bookly is a workspace for client work: booking pages, a briefing before every call, transcription with consent and recaps, follow-ups and payment requests on one contact page. Its core is AGPL-3.0 and runs complete on your own server.",
    themIs:
      "Cal.com is a hosted scheduling platform for individuals, teams and enterprises, with Cal Video built in. Its community edition, Cal.diy, now ships separately under MIT.",
    chooseBookly: [
      "you want to self-host the same product you would use in production, from an open-source core",
      "you want briefings, recaps and follow-ups tied to a page per client",
      "you want routing forms on every plan",
    ],
    chooseThem: [
      "you want free built-in video today, with recording on team plans",
      "you need HIPAA, SOC 2 or ISO 27001 claims (Organizations)",
      "you are building scheduling into your own product with their embeddable components and platform API",
      "you want payments and CRM sync for one person at no cost",
    ],
    rows: [
      {
        feature: "What it is",
        bookly: "A connected workspace for client work, starting at the booking",
        them: "A hosted scheduling platform for individuals, teams and enterprises",
        source: "https://cal.com/pricing",
      },
      {
        feature: "Price per person",
        bookly: BOOKLY_PRICE,
        them: "Free for one user; Teams $12 and Organizations $28 a user a month, billed yearly; Enterprise custom",
        source: "https://cal.com/pricing",
      },
      {
        feature: "Licence and self-hosting",
        bookly: BOOKLY_SELF_HOST,
        them: "Closed source since April 2026; self-hosting through an Enterprise sale. The MIT community edition, Cal.diy, is recommended for personal, non-production use and leaves out teams, routing forms and workflows",
        source: "https://cal.com/blog/calcom-v6-4",
      },
      {
        feature: "Video",
        bookly: "Bookly video (Pro and Team), or Google Meet, Zoom and Teams",
        them: "Cal Video built in and free for all accounts; recording on team plans",
        source: "https://cal.com/help/event-types/calvideo-advanced-settings",
      },
      {
        feature: "Notes and recaps",
        bookly: BOOKLY_RECAPS,
        them: "Cal Video transcripts summarised into a recap, rolling out by waitlist",
        source: "https://cal.com/blog/calcom-v6-7",
      },
      {
        feature: "Briefing before the call",
        bookly: "On every plan, from the contact's history",
        them: "Not listed on the pages we read",
      },
      {
        feature: "Contacts and CRM",
        bookly: "A page per client, plus HubSpot and Pipedrive sync (Pro and Team)",
        them: "Two-way Salesforce and HubSpot sync, on the free plan too",
        source: "https://cal.com/pricing",
      },
      {
        feature: "Payments",
        bookly: BOOKLY_PAYMENTS,
        them: "Stripe and PayPal, on the free plan too",
        source: "https://cal.com/pricing",
      },
      {
        feature: "Routing forms",
        bookly: "Every plan",
        them: "Teams and up",
        source: "https://cal.com/pricing",
      },
      {
        feature: "Round-robin and collective",
        bookly: "Team",
        them: "Teams and up",
        source: "https://cal.com/pricing",
      },
    ],
    ahead: [
      "Developer mindshare: about 49,000 GitHub stars on the repository, embeddable components and a platform API.",
      "A generous free tier: payments and two-way CRM sync for one user at no cost.",
      "Built-in video with recording, and compliance claims (HIPAA, SOC 2, ISO 27001) on Organizations.",
    ],
    faq: [
      [
        "I self-host Cal.com today. What changes?",
        "Cal.com's open-source edition continues as Cal.diy under MIT, recommended for personal use, without teams, routing forms or workflows. Bookly's core is AGPL-3.0 and runs complete on your own server, teams and routing included.",
      ],
      [
        "Is Bookly open source?",
        "The core is, under AGPL-3.0, and it stays that way: shipped features never move behind the commercial licence. Enterprise modules are source-available under the Elastic License 2.0.",
      ],
      figures("Cal.com"),
    ],
    sources: [
      "https://cal.com/pricing",
      "https://cal.com/blog/calcom-v6-4",
      "https://cal.com/blog/calcom-v6-7",
      "https://cal.com/help/event-types/calvideo-advanced-settings",
      "https://github.com/calcom/cal.diy",
    ],
    verified: VERIFIED,
  },
  {
    slug: "savvycal",
    name: "SavvyCal",
    group: "scheduling",
    summary: "A better link, or a connected workspace.",
    first: "Bookly vs SavvyCal:",
    second: "A better link, or a connected workspace.",
    lead: "SavvyCal makes picking a time pleasant for the person booking, with a calendar overlay and simple pricing. Bookly is built around what comes after the booking. Where each one wins.",
    booklyIs:
      "Bookly is a workspace for client work: booking pages, a briefing before every call, transcription with consent and recaps, follow-ups and payment requests, all on one contact page.",
    themIs:
      "SavvyCal is a hosted scheduling-link tool from a small independent company, known for letting invitees overlay their own calendar on a week view.",
    chooseBookly: [
      "you want to take bookings on a free plan",
      "you want recaps, follow-ups and a page per client after the booking",
      "you want payments on every plan",
      "you want to self-host",
    ],
    chooseThem: [
      "the booking experience for your invitee matters most: overlay, week view, ranked times",
      "you want one simple price with nothing to unlock",
      "you want AI assistants to book through an MCP server, on every plan",
    ],
    rows: [
      {
        feature: "Price per person",
        bookly: BOOKLY_PRICE,
        them: "Basic $12 a month ($10 annual); Premium $20 ($17 annual); 25% off for nonprofits, educators and students",
        source: "https://savvycal.com/pricing",
      },
      {
        feature: "Free plan",
        bookly: "Takes bookings: a booking page, contacts, briefings and paid bookings",
        them: "Calendars, links and meeting polls; taking bookings needs Basic or Premium",
        source: "https://savvycal.com/pricing",
      },
      {
        feature: "Notes and recaps",
        bookly: BOOKLY_RECAPS,
        them: "None listed; AI assistants can find times and book through MCP",
        source: "https://savvycal.com/features",
      },
      {
        feature: "Video",
        bookly: "Bookly video (Pro and Team), or Google Meet, Zoom and Teams",
        them: "Zoom, Google Meet, Microsoft Teams and Whereby",
        source: "https://savvycal.com/integrations-directory",
      },
      {
        feature: "Payments",
        bookly: BOOKLY_PAYMENTS,
        them: "Stripe on Premium with no added fee; no session packages or paid group sessions",
        source: "https://savvycal.com/stripe",
      },
      {
        feature: "Routing forms",
        bookly: "Every plan",
        them: "Not listed on the pages we read",
      },
      {
        feature: "Team scheduling",
        bookly: "Round-robin and collective on Team",
        them: "Round robin, collective and group on both plans",
        source: "https://savvycal.com/pricing",
      },
      {
        feature: "API and webhooks",
        bookly: "Pro and Team",
        them: "REST API and webhooks on both plans",
        source: "https://developers.savvycal.com/",
      },
      {
        feature: "Custom domain",
        bookly: "Pro (1) and Team (3)",
        them: "Premium",
        source: "https://savvycal.com/pricing",
      },
      {
        feature: "Self-hosting",
        bookly: BOOKLY_SELF_HOST,
        them: "None listed",
      },
    ],
    ahead: [
      "The invitee's booking experience: calendar overlay, week view, ranked availability and controls to defend your time.",
      "Simple pricing: unlimited links, calendars and teams on every plan, nothing to unlock.",
      "An MCP server on every plan, so AI assistants can find a time and book.",
    ],
    faq: [
      [
        "Can I use Bookly just for scheduling?",
        "Yes. The booking page, event types, availability and calendar sync work on their own; the briefing, recap and contact page are there when you want them.",
      ],
      figures("SavvyCal"),
    ],
    sources: [
      "https://savvycal.com/pricing",
      "https://savvycal.com/features",
      "https://savvycal.com/stripe",
      "https://savvycal.com/integrations-directory",
      "https://developers.savvycal.com/",
    ],
    verified: VERIFIED,
  },
  {
    slug: "greenhouse",
    name: "Greenhouse",
    group: "hiring",
    summary: "An enterprise ATS, or selection on your client platform.",
    first: "Bookly vs Greenhouse:",
    second: "An enterprise ATS, or selection on the platform you already use.",
    lead: "Greenhouse is a mature applicant tracking system for companies hiring across teams and regions. Bookly's hiring, in beta and complete with Bookly 1.0, puts applications, reviews, interviews and decisions on the same platform as your scheduling and client work. It is not built to replace an enterprise ATS today.",
    booklyIs:
      "Hiring on Bookly, in beta: an application page and a pipeline you define today; independent reviews, interviews scheduled from a stage and decisions recorded with who made them and why arrive with Bookly 1.0.",
    themIs:
      "Greenhouse is an applicant tracking and hiring platform: sourcing, structured interviewing, scheduling, Voice AI interviews and onboarding, plus MyGreenhouse for job seekers.",
    chooseBookly: [
      "you select people in rounds: fellowships, cohorts, internships, small hiring loops",
      "you want interviews booked on the calendars and video you already use",
      "you want AI that summarises and never scores people",
      "you want to self-host, or you also run client work on Bookly",
    ],
    chooseThem: [
      "you hire at scale across regions and business units",
      "you need deep governance today: approvals, demographic reporting, audit log, SSO",
      "you want hundreds of integrations and a candidate-side network",
      "you want an AI voice screen as a first interview",
    ],
    rows: [
      {
        feature: "What it is",
        bookly: `Hiring on the Bookly platform. ${BETA}; reviews, interview scheduling and decisions: ${COMING}`,
        them: "An applicant tracking and hiring platform with sourcing, structured interviewing, scheduling, Voice AI and onboarding",
        source: "https://www.greenhouse.com/",
      },
      {
        feature: "Pricing",
        bookly: `Planned on every plan; Free has ${PLANS.free.limits.opportunities} open opportunity at a time`,
        them: "Core, Plus and Pro, priced on request; Voice AI sold separately",
        source: "https://www.greenhouse.com/pricing",
      },
      {
        feature: "Structured reviews",
        bookly: `Scorecards with assigned reviewers, independent until each submits. ${COMING}`,
        them: "Structured interview kits and scorecards, with AI scorecard summaries",
        source: "https://www.greenhouse.com/pricing",
      },
      {
        feature: "Interview scheduling",
        bookly: `Interviews are bookings on Bookly video, Meet, Zoom or Teams. Panels and self-scheduling links from a stage: ${COMING}`,
        them: "Built in, with self-scheduling, scheduling links and automation rules",
        source: "https://www.greenhouse.com/pricing",
      },
      {
        feature: "AI and decisions",
        bookly:
          "AI may summarise and draft; it never ranks, scores, rejects or recommends a decision about a person",
        them: "Talent Matching prioritises candidates against weighted criteria; Voice AI scores each answer and never rejects or advances; rule-based auto-reject and auto-advance are listed",
        source: "https://www.greenhouse.com/ai-recruiting",
      },
      {
        feature: "Candidate status",
        bookly: `A status page each applicant can check. ${BETA}`,
        them: "MyGreenhouse shows job seekers their stage where the employer maps stages",
        source: "https://www.greenhouse.com/product-features/mygreenhouse-stages",
      },
      {
        feature: "Data and retention",
        bookly: `Full workspace export; retention set per opportunity (12 months after the cycle for jobs by default), with automatic deletion: ${COMING}`,
        them: "Harvest API, BI Connector (Plus) and an audit log (Pro)",
        source: "https://developers.greenhouse.io/harvest.html",
      },
      {
        feature: "Self-hosting",
        bookly: BOOKLY_SELF_HOST,
        them: "None listed",
      },
    ],
    ahead: [
      "Market presence: 7,500+ companies and more than a decade in hiring, by Greenhouse's own count.",
      "Depth of structured hiring and governance: scorecards, approvals, demographic data, sandbox, audit log and SSO.",
      "An ecosystem of hundreds of integrations, a mature API and a candidate-side network.",
    ],
    faq: [
      [
        "Is Bookly's hiring available now?",
        "Not yet. The data model is in place and the screens are being built for Bookly 1.0, programs and cohorts first. Talk to us if you would like to be a design partner.",
      ],
      figures("Greenhouse"),
    ],
    sources: [
      "https://www.greenhouse.com/pricing",
      "https://www.greenhouse.com/",
      "https://www.greenhouse.com/ai-recruiting",
      "https://www.greenhouse.com/product-features/mygreenhouse-stages",
      "https://developers.greenhouse.io/harvest.html",
    ],
    verified: VERIFIED,
  },
  {
    slug: "ashby",
    name: "Ashby",
    group: "hiring",
    summary: "An all-in-one ATS, or selection on your client platform.",
    first: "Bookly vs Ashby:",
    second: "An all-in-one ATS, or selection on the platform you already use.",
    lead: "Ashby is an all-in-one recruiting platform with deep analytics. Bookly's hiring, in beta and complete with Bookly 1.0, puts applications, reviews, interviews and decisions on the same platform as your scheduling and client work, with an open-source core.",
    booklyIs:
      "Hiring on Bookly, in beta: an application page and a pipeline you define today; independent reviews, interviews scheduled from a stage and decisions recorded with who made them and why arrive with Bookly 1.0.",
    themIs:
      "Ashby is an all-in-one recruiting platform: applicant tracking, CRM and sourcing, scheduling and analytics. It also sells its analytics on top of other applicant trackers.",
    chooseBookly: [
      "you run cohorts, fellowships or internships with interviews and decision meetings",
      "you want reviews in words, never averaged into a score",
      "you want to self-host, or you also run client work on Bookly",
    ],
    chooseThem: [
      "you want deep recruiting analytics and custom reports",
      "you need sourcing, CRM, offers with e-signature and approvals in one tool",
      "you want AI screening with citations and a third-party bias audit, today",
    ],
    rows: [
      {
        feature: "What it is",
        bookly: `Hiring on the Bookly platform. ${BETA}; reviews, interview scheduling and decisions: ${COMING}`,
        them: "An all-in-one recruiting platform: ATS, CRM and sourcing, scheduling, analytics",
        source: "https://www.ashbyhq.com/",
      },
      {
        feature: "Pricing",
        bookly: `Planned on every plan; Free has ${PLANS.free.limits.opportunities} open opportunity at a time`,
        them: "Foundations (up to 100 employees) $400 a month in total, 10% off yearly; Plus and Enterprise on request; add-ons for AI Notetaker, Advanced Scheduling, SSO and SMS",
        source: "https://www.ashbyhq.com/pricing",
      },
      {
        feature: "Structured reviews",
        bookly: `Scorecards with assigned reviewers, independent until each submits; ratings in words, never averaged. ${COMING}`,
        them: "Interview plans with structured feedback; candidate reviews with average scores tracked in one place",
        source: "https://www.ashbyhq.com/pricing",
      },
      {
        feature: "Interview scheduling",
        bookly: `Interviews are bookings on Bookly video, Meet, Zoom or Teams. Panels and self-scheduling links from a stage: ${COMING}`,
        them: "Built in; the AI auto-scheduler needs the Advanced Scheduling add-on",
        source: "https://www.ashbyhq.com/pricing",
      },
      {
        feature: "AI and decisions",
        bookly:
          "AI may summarise and draft; it never ranks, scores, rejects or recommends a decision about a person",
        them: "Application review marks criteria as met or not met, with citations, and never ranks or rates; rule-based auto-reject on form answers is listed",
        source: "https://www.ashbyhq.com/ai",
      },
      {
        feature: "Data and export",
        bookly: "Full workspace export and the Bookly API",
        them: "API access, Snowflake and S3 data sharing, scheduled report delivery",
        source: "https://www.ashbyhq.com/pricing",
      },
      {
        feature: "Self-hosting",
        bookly: BOOKLY_SELF_HOST,
        them: "None listed",
      },
    ],
    ahead: [
      "Analytics depth: custom reports and dashboards, an AI report builder and diversity funnel reporting.",
      "Breadth in one tool: sourcing sequences, CRM, scheduling, offers with e-signature and approvals, and 250+ integrations.",
      "Mature, documented AI with guardrails: citations, human override and a third-party bias audit.",
    ],
    faq: [
      [
        "Is Bookly's hiring available now?",
        "Not yet. The data model is in place and the screens are being built for Bookly 1.0, programs and cohorts first. Talk to us if you would like to be a design partner.",
      ],
      figures("Ashby"),
    ],
    sources: [
      "https://www.ashbyhq.com/pricing",
      "https://www.ashbyhq.com/",
      "https://www.ashbyhq.com/ai",
    ],
    verified: VERIFIED,
  },
  {
    slug: "submittable",
    name: "Submittable",
    group: "hiring",
    summary: "Grant software, or selection with interviews built in.",
    first: "Bookly vs Submittable:",
    second: "Grant software, or selection with interviews built in.",
    lead: "Submittable runs grant, scholarship, award and CSR programs for funders at large scale. Bookly's selection tools, in beta and complete with Bookly 1.0, are for programs that interview: fellowships, accelerators, internships and admissions, on the same platform as your scheduling and video.",
    booklyIs:
      "Programs and cohorts on Bookly, in beta: intake rounds from a template, applications with documents and a pipeline today; shared scorecards and batch decisions at a decision meeting arrive with Bookly 1.0.",
    themIs:
      "Submittable is software foundations, governments and corporations use to run grant and CSR programs, including scholarships, awards, employee giving and volunteering.",
    chooseBookly: [
      "interviews, info sessions or assessment days are part of how you select",
      "you want AI that never scores applicants",
      "you want scheduling, video, messages and selection on one platform you can self-host",
    ],
    chooseThem: [
      "you distribute money: budgets, disbursements, fraud and charity checks",
      "you run grants or CSR programs at scale",
      "you want anonymous review that hides personal details from reviewers, today",
    ],
    rows: [
      {
        feature: "What it is",
        bookly: `Selection for programs and cohorts on the Bookly platform. ${BETA}; reviews and batch decisions: ${COMING}`,
        them: "Grant, scholarship, award and CSR program software for funders",
        source: "https://www.submittable.com/",
      },
      {
        feature: "Pricing",
        bookly: `Planned on every plan; Free has ${PLANS.free.limits.opportunities} open opportunity at a time`,
        them: "Packages for CSR, grants and enterprise, priced on request",
        source: "https://www.submittable.com/pricing/",
      },
      {
        feature: "Reviews",
        bookly: `Shared scorecards, assigned reviewers, independent until each submits; anonymised review planned as an Enterprise module. ${COMING}`,
        them: "Multi-stage review with assigned reviewers, voting or scored forms, and optional anonymous review",
        source: "https://www.submittable.com/features/reviewing",
      },
      {
        feature: "Interviews and sessions",
        bookly: `Interviews as bookings, info sessions and assessment days as group sessions with seats. Scheduling them from a stage: ${COMING}`,
        them: "Interview scheduling not listed",
      },
      {
        feature: "AI and decisions",
        bookly:
          "AI may summarise and draft; it never ranks, scores, rejects or recommends a decision about a person",
        them: "Smart Summary can give a score from a prompt; Smart Reviewer assesses applications against your rubric alongside people; Automated Review sorts and scores (premium)",
        source: "https://www.submittable.com/ai",
      },
      {
        feature: "Applicant experience",
        bookly: `A status page each applicant can check (${BETA.toLowerCase()}); one conversation per applicant: ${COMING}`,
        them: "Form builder and application portal, with messaging to applicants",
        source: "https://www.submittable.com/solutions/grants",
      },
      {
        feature: "Self-hosting",
        bookly: BOOKLY_SELF_HOST,
        them: "None listed",
      },
    ],
    ahead: [
      "Scale in grantmaking: 165,000+ programs and $10B+ in funds managed, by Submittable's own count.",
      "Funder tools: budgets and disbursements, fraud and ID verification, charity checks and awardee agreements.",
      "Speed to launch: most customers launch a new program in two weeks or less, by their own figure.",
    ],
    faq: [
      [
        "Can Bookly pay out grants?",
        "No. Bookly takes payments into your own Stripe account (application fees and deposits, once selection ships), but it does not disburse funds. If paying recipients is the heart of your program, Submittable is built for it.",
      ],
      figures("Submittable"),
    ],
    sources: [
      "https://www.submittable.com/pricing/",
      "https://www.submittable.com/",
      "https://www.submittable.com/features/reviewing",
      "https://www.submittable.com/solutions/grants",
      "https://www.submittable.com/ai",
    ],
    verified: VERIFIED,
  },
];

export const comparison = (slug: string) => COMPARISONS.find((c) => c.slug === slug);
