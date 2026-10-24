import { FILE_ACCEPT, PUBLIC_FILE_MB, type Field, type FormSchema } from "@bookly/forms";
import type {
  FormPurpose,
  OpportunityType,
  RuleAction,
  ScorecardCriterion,
  StageCategory,
} from "@bookly/db/schema";
import type { StageModuleConfigs } from "../pipelines/modules";

/*
 * Opportunity setup templates (planning/v2/ux/opportunity-setup.md): data, not code. Each one
 * pre-fills the stages with their categories and candidate-facing labels, the modules on each
 * stage, the rules, the forms, the scorecards and the message copy; everything is editable
 * afterwards. Ids that only exist once the draft is created are written as `$name` (`$application`
 * is the application form, `$review` a scorecard) and swapped for real ids by `server/hiring/setup.ts`.
 * No stage name, template name or label is written anywhere else (acceptance 14).
 */

export const TEMPLATE_IDS = ["cohort", "internship", "program", "admissions", "blank"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type TemplateRule = { name: string; on: "enter" | "leave"; actions: RuleAction[] };

export type TemplateStage = {
  key: string;
  name: string;
  category: StageCategory;
  /** The hold stage the decision flow uses for waitlist outcomes (at most one). */
  isWaitlist?: boolean;
  /** What applicants see instead of the stage name. */
  label: string;
  modules: StageModuleConfigs;
  rules?: TemplateRule[];
};

export type TemplateForm = { name: string; purpose: FormPurpose; schema: FormSchema };
export type TemplateScorecard = { name: string; criteria: ScorecardCriterion[] };

export type HiringTemplate = {
  id: TemplateId;
  name: string;
  /** One line on who it suits, on its card. */
  purpose: string;
  type: OpportunityType;
  stages: TemplateStage[];
  /** `$application` is always there: the entry stage's form. */
  forms: Record<string, TemplateForm>;
  scorecards: Record<string, TemplateScorecard>;
};

/* ---------------- Building blocks ---------------- */

const field = (f: Field): Field => f;

const NAME = field({ id: "name", type: "short_text", label: "Full name", required: true });
const EMAIL = field({ id: "email", type: "email", label: "Email", required: true });
/** Canon X5: internship and admissions forms ask for it; any coordinator can add it elsewhere. */
export const AGE_CONFIRMATION = field({
  id: "age_16",
  type: "checkbox",
  label: "I am 16 or older.",
  required: true,
});
const fileField = (id: string, label: string, help?: string): Field => ({
  id,
  type: "file",
  label,
  ...(help ? { help } : {}),
  required: true,
  file: { accept: [...FILE_ACCEPT.documents.accept], maxMb: PUBLIC_FILE_MB, maxFiles: 1 },
});

/** A one-page form from fields, in order. */
const form = (name: string, purpose: FormPurpose, fields: Field[]): TemplateForm => ({
  name,
  purpose,
  schema: { v: 1, pages: [{ id: "p1", fieldIds: fields.map((f) => f.id) }], fields },
});

const rating = (id: string, label: string, description: string): ScorecardCriterion => ({
  id,
  label,
  description,
  scale: {
    type: "rating",
    min: 1,
    max: 4,
    labels: ["Not yet", "Some evidence", "Clear evidence", "Strong evidence"],
  },
  required: true,
});

const email = (
  id: string,
  name: string,
  subject: string,
  body: string,
): NonNullable<StageModuleConfigs["messages"]>["templates"][number] => ({
  id,
  name,
  channel: "email",
  subject,
  body,
  // Status emails about an application: sent even to people who opted out of marketing.
  transactional: true,
});

const messages = (...templates: ReturnType<typeof email>[]): StageModuleConfigs["messages"] => ({
  v: 1,
  enabled: true,
  templates,
});

const sendOnEnter = (name: string, templateId: string): TemplateRule => ({
  name,
  on: "enter",
  actions: [{ type: "send_message", templateId }],
});

const entryForms = (...extra: { formId: string; audience: "reference" }[]) => ({
  v: 1 as const,
  enabled: true,
  forms: [
    { formId: "$application", audience: "subject" as const, required: true },
    ...extra.map((e) => ({ ...e, required: false })),
  ],
});

const reviews = (
  scorecardId: string,
  reviewersPerApplication: number,
  dueDays: number,
  interviewersReview = false,
): StageModuleConfigs["reviews"] => ({
  v: 1,
  enabled: true,
  scorecardId,
  reviewersPerApplication,
  assignment: "round_robin",
  poolUserIds: [],
  interviewersReview,
  dueDays,
});

const interview = (
  title: string,
  minutes: number,
  format: "one_on_one" | "panel" | "group",
): StageModuleConfigs["scheduling"] => ({
  v: 1,
  enabled: true,
  sessions: [],
  suggested: { title, minutes, format },
});

const RECEIVED = email(
  "t_received",
  "Application received",
  "We received your application",
  "Hi {name},\n\nThank you for applying to {opportunity}. We read every application and will tell you what happens next by {decides_by}.\n\nYou can check where your application stands at any time from the link in this email.",
);

const NOT_SELECTED = email(
  "t_not_selected",
  "Not selected",
  "Your application to {opportunity}",
  "Hi {name},\n\nThank you for the time you put into your application to {opportunity}. We weren't able to offer you a place this time.\n\nWe received many strong applications and this was a hard decision. We hope you'll apply again.",
);

const WAITLISTED = email(
  "t_waitlist",
  "On the waitlist",
  "You're on the waitlist for {opportunity}",
  "Hi {name},\n\nWe'd like to keep your application on our waitlist for {opportunity}. If a place opens up, we'll write to you straight away.\n\nYou don't need to do anything now.",
);

const welcome = (verb: string) =>
  email(
    "t_outcome_won",
    verb,
    "Welcome to {opportunity}",
    `Hi {name},\n\nWe're delighted to tell you that you've been ${verb.toLowerCase()} to {opportunity}.\n\nWe'll be in touch shortly with your next steps.`,
  );

const outcomes = (won: { key: string; name: string; label: string; verb: string }) =>
  [
    {
      key: won.key,
      name: won.name,
      category: "won",
      label: won.label,
      modules: { messages: messages(welcome(won.verb)) },
    },
    {
      key: "waitlist",
      name: "Waitlist",
      category: "hold",
      isWaitlist: true,
      label: "On the waitlist",
      modules: { messages: messages(WAITLISTED) },
    },
    {
      key: "not_selected",
      name: "Not selected",
      category: "lost",
      label: "Not selected",
      modules: { messages: messages(NOT_SELECTED) },
    },
  ] satisfies TemplateStage[];

const applied = (modules: StageModuleConfigs = {}): TemplateStage => ({
  key: "applied",
  name: "Applied",
  category: "open",
  label: "Submitted",
  modules: { forms: entryForms(), messages: messages(RECEIVED), ...modules },
  rules: [sendOnEnter("Confirm the application", RECEIVED.id)],
});

const decision = (): TemplateStage => ({
  key: "decision",
  name: "Decision",
  category: "open",
  label: "Under review",
  modules: {
    decisions: {
      v: 1,
      enabled: true,
      outcomes: [],
      targets: {},
      batch: true,
      meetingEventTypeId: null,
      templates: {},
    },
  },
});

const INTERVIEW_CRITERIA = [
  rating("communication", "Communication", "Explains their thinking clearly and listens."),
  rating("depth", "Depth of thinking", "Goes beyond the first answer; weighs trade-offs."),
  rating("collaboration", "Collaboration", "Works with others' ideas; credits the team."),
];

/* ---------------- The templates ---------------- */

const cohort: HiringTemplate = {
  id: "cohort",
  name: "Cohort or fellowship",
  purpose:
    "A fixed intake with a deadline, several reviewers per application and decisions made together.",
  type: "fellowship",
  forms: {
    $application: form("Application", "application", [
      NAME,
      EMAIL,
      field({
        id: "statement",
        type: "long_text",
        label: "Why do you want to join, and what would you work on?",
        help: "Up to 500 words.",
        required: true,
        validation: { maxLength: 4000 },
      }),
      fileField("cv", "CV or résumé"),
      fileField("proposal", "Project proposal", "Two pages at most."),
    ]),
    $acceptance: form("Acceptance", "stage", [
      field({
        id: "accept",
        type: "yes_no",
        label: "Do you accept your place?",
        required: true,
      }),
      field({ id: "start", type: "date", label: "When can you start?" }),
    ]),
  },
  scorecards: {
    $review: {
      name: "Application review",
      criteria: [
        rating("motivation", "Motivation and fit", "Why this program, and why now."),
        rating("record", "Track record", "What they have done with what they had."),
        rating("proposal", "Project proposal", "Clear, achievable and worth doing."),
        rating("growth", "Potential to grow", "How much they would gain from the program."),
      ],
    },
    $interview: { name: "Interview", criteria: INTERVIEW_CRITERIA },
  },
  stages: [
    applied(),
    {
      key: "in_review",
      name: "In review",
      category: "open",
      label: "Under review",
      modules: { reviews: reviews("$review", 3, 10) },
      rules: [{ name: "Assign reviewers", on: "enter", actions: [{ type: "assign_reviewers" }] }],
    },
    {
      key: "interview",
      name: "Interview",
      category: "open",
      label: "Interview: please book a time",
      modules: {
        scheduling: interview("Panel interview", 45, "panel"),
        video: { v: 1, enabled: true, autoCapture: "ask" },
        reviews: reviews("$interview", 3, 7, true),
      },
    },
    decision(),
    ...outcomes({ key: "admitted", name: "Admitted", label: "Admitted", verb: "Admitted" }).map(
      (s) =>
        s.category === "won"
          ? {
              ...s,
              modules: {
                ...s.modules,
                forms: {
                  v: 1 as const,
                  enabled: true,
                  forms: [{ formId: "$acceptance", audience: "subject" as const, required: true }],
                },
                files: {
                  v: 1 as const,
                  enabled: true,
                  required: [
                    {
                      label: "Signed agreement",
                      accept: [...FILE_ACCEPT.pdf.accept],
                      maxMb: PUBLIC_FILE_MB,
                    },
                  ],
                  folder: "per_subject" as const,
                },
                tasks: {
                  v: 1 as const,
                  enabled: true,
                  checklist: [
                    { title: "Send the welcome pack", assignee: "coordinator", dueDays: 3 },
                    { title: "Add to the cohort channel", assignee: "coordinator", dueDays: 7 },
                  ],
                },
              },
            }
          : s,
    ),
  ],
};

const internship: HiringTemplate = {
  id: "internship",
  name: "Internship",
  purpose:
    "Many applicants, a quick screen, then interviews. Route people to tracks by their answers.",
  type: "internship",
  forms: {
    $application: form("Application", "application", [
      NAME,
      EMAIL,
      field({ id: "school", type: "short_text", label: "School or university", required: true }),
      field({ id: "graduation", type: "date", label: "Expected graduation date", required: true }),
      field({
        id: "track",
        type: "select",
        label: "Which track are you applying for?",
        required: true,
        options: [
          { value: "Engineering", label: "Engineering" },
          { value: "Design", label: "Design" },
        ],
      }),
      fileField("cv", "CV or résumé"),
      AGE_CONFIRMATION,
    ]),
  },
  scorecards: {
    $screen: {
      name: "Screen",
      criteria: [
        rating("fit", "Fit for the track", "Coursework or projects relevant to the track."),
        rating("motivation", "Motivation", "Why this internship."),
      ],
    },
    $interview: { name: "Interview", criteria: INTERVIEW_CRITERIA },
  },
  stages: [
    applied({
      forms: entryForms(),
      routing: {
        v: 1,
        enabled: true,
        rules: ["Engineering", "Design"].map((track) => ({
          match: "all" as const,
          conditions: [{ fieldId: "track", op: "equals", value: track }],
          to: { tag: track.toLowerCase() },
        })),
      },
    }),
    {
      key: "screen",
      name: "Screen",
      category: "open",
      label: "Under review",
      modules: { reviews: reviews("$screen", 1, 5) },
      rules: [{ name: "Assign a screener", on: "enter", actions: [{ type: "assign_reviewers" }] }],
    },
    {
      key: "interview",
      name: "Interview",
      category: "open",
      label: "Interview: please book a time",
      modules: {
        scheduling: interview("Interview", 30, "one_on_one"),
        video: { v: 1, enabled: true, autoCapture: "ask" },
        reviews: reviews("$interview", 2, 5, true),
      },
    },
    decision(),
    ...outcomes({ key: "accepted", name: "Accepted", label: "Accepted", verb: "Accepted" }),
  ],
};

const program: HiringTemplate = {
  id: "program",
  name: "Program",
  purpose:
    "Accelerators and bootcamps. Teams can apply together; onboarding starts when they're in.",
  type: "program",
  forms: {
    $application: form("Application", "application", [
      NAME,
      EMAIL,
      field({ id: "project", type: "long_text", label: "What are you building?", required: true }),
      field({ id: "team_heading", type: "heading", label: "Your team" }),
      field({
        id: "team",
        type: "long_text",
        label: "Who else is on the team? Names, emails and roles.",
        help: "Leave empty if you're applying on your own.",
      }),
      fileField("deck", "Pitch deck or one-pager"),
    ]),
  },
  scorecards: {
    $review: {
      name: "Application review",
      criteria: [
        rating("problem", "Problem", "A real problem for people they understand."),
        rating("team", "Team", "Can this team build it?"),
        rating("progress", "Progress", "What they have shipped or learned so far."),
      ],
    },
    $interview: { name: "Interview", criteria: INTERVIEW_CRITERIA },
  },
  stages: [
    applied(),
    {
      key: "review",
      name: "Review",
      category: "open",
      label: "Under review",
      modules: { reviews: reviews("$review", 2, 10) },
      rules: [{ name: "Assign reviewers", on: "enter", actions: [{ type: "assign_reviewers" }] }],
    },
    {
      key: "interview",
      name: "Interview",
      category: "open",
      label: "Interview: please book a time",
      modules: {
        scheduling: interview("Interview", 30, "panel"),
        video: { v: 1, enabled: true, autoCapture: "ask" },
        reviews: reviews("$interview", 2, 7, true),
      },
    },
    decision(),
    ...outcomes({ key: "onboarded", name: "Onboarded", label: "Admitted", verb: "Admitted" }).map(
      (s) =>
        s.category === "won"
          ? {
              ...s,
              modules: {
                ...s.modules,
                tasks: {
                  v: 1 as const,
                  enabled: true,
                  checklist: [
                    { title: "Send the onboarding guide", assignee: "coordinator", dueDays: 2 },
                    { title: "Set up their workspace access", assignee: "coordinator", dueDays: 5 },
                  ],
                },
                payments: {
                  v: 1 as const,
                  enabled: false,
                  amountCents: 50_000,
                  currency: "usd",
                  kind: "deposit" as const,
                  waivable: true,
                  description: "Deposit to hold your place",
                },
                scheduling: interview("Orientation", 60, "group"),
              },
            }
          : s,
    ),
  ],
};

const admissions: HiringTemplate = {
  id: "admissions",
  name: "Admissions",
  purpose: "Courses and schools. References, optional fees and deposits.",
  type: "admissions",
  forms: {
    $application: form("Application", "application", [
      NAME,
      EMAIL,
      field({
        id: "background",
        type: "long_text",
        label: "Tell us about your studies so far.",
        required: true,
      }),
      field({ id: "referee_name", type: "short_text", label: "Referee's name", required: true }),
      field({ id: "referee_email", type: "email", label: "Referee's email", required: true }),
      fileField("transcript", "Transcript"),
      AGE_CONFIRMATION,
    ]),
    $reference: form("Reference", "reference", [
      field({
        id: "relationship",
        type: "short_text",
        label: "How do you know the applicant?",
        required: true,
      }),
      field({
        id: "reference",
        type: "long_text",
        label: "What should the admissions team know about them?",
        required: true,
      }),
    ]),
  },
  scorecards: {
    $review: {
      name: "Application review",
      criteria: [
        rating("academic", "Academic readiness", "Ready for the course's level."),
        rating("motivation", "Motivation", "Why this course."),
        rating("reference", "Reference", "What the referee says."),
      ],
    },
    $interview: { name: "Interview", criteria: INTERVIEW_CRITERIA },
  },
  stages: [
    {
      ...applied(),
      modules: {
        ...applied().modules,
        forms: entryForms({ formId: "$reference", audience: "reference" }),
        payments: {
          v: 1,
          enabled: false,
          amountCents: 5_000,
          currency: "usd",
          kind: "fee",
          waivable: true,
          description: "Application fee",
        },
      },
      rules: [
        ...(applied().rules ?? []),
        {
          name: "Ask for the reference",
          on: "enter",
          actions: [{ type: "request_form", formId: "$reference" }],
        },
      ],
    },
    {
      key: "review",
      name: "Review",
      category: "open",
      label: "Under review",
      modules: { reviews: reviews("$review", 2, 14) },
      rules: [{ name: "Assign reviewers", on: "enter", actions: [{ type: "assign_reviewers" }] }],
    },
    {
      key: "interview",
      name: "Interview",
      category: "open",
      label: "Interview: please book a time",
      modules: {
        scheduling: interview("Admissions interview", 30, "one_on_one"),
        reviews: reviews("$interview", 1, 7, true),
      },
    },
    decision(),
    ...outcomes({ key: "enrolled", name: "Enrolled", label: "Admitted", verb: "Admitted" }).map(
      (s) =>
        s.category === "won"
          ? {
              ...s,
              modules: {
                ...s.modules,
                payments: {
                  v: 1 as const,
                  enabled: false,
                  amountCents: 20_000,
                  currency: "usd",
                  kind: "deposit" as const,
                  waivable: true,
                  description: "Deposit to confirm your place",
                },
              },
            }
          : s,
    ),
  ],
};

const blank: HiringTemplate = {
  id: "blank",
  name: "Start blank",
  purpose: "Three stages to build on.",
  type: "custom",
  forms: { $application: form("Application", "application", [NAME, EMAIL]) },
  scorecards: {},
  stages: [
    {
      key: "applied",
      name: "Applied",
      category: "open",
      label: "Submitted",
      modules: { forms: entryForms() },
    },
    {
      key: "accepted",
      name: "Accepted",
      category: "won",
      label: "Accepted",
      modules: {
        messages: messages(
          email(
            "t_outcome_won",
            "Accepted",
            "Your application to {opportunity}",
            "Hi {name},\n\nGood news: your application to {opportunity} was accepted. We'll be in touch with next steps.",
          ),
        ),
      },
    },
    {
      key: "not_selected",
      name: "Not selected",
      category: "lost",
      label: "Not selected",
      modules: { messages: messages(NOT_SELECTED) },
    },
  ],
};

export const TEMPLATES: Record<TemplateId, HiringTemplate> = {
  cohort,
  internship,
  program,
  admissions,
  blank,
};

export const isTemplateId = (s: string): s is TemplateId =>
  (TEMPLATE_IDS as readonly string[]).includes(s);

/**
 * Replaces `$name` placeholders anywhere in a value (module configs, rule actions) with the real
 * ids created for the draft. Unknown placeholders are left as they are and fail validation.
 */
export function bindIds<T>(value: T, ids: Record<string, string>): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === "string" && v in ids ? ids[v] : v)),
  ) as T;
}
