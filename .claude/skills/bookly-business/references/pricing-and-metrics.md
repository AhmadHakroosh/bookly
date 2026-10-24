# Pricing, cost model and metric definitions

All figures below that are not in `packages/cloud/src/index.ts` or `docs/cloud.md` are
assumptions. Replace them with real invoices before using them in a decision.

## Tier map (open core)

| Tier             | Contract                                     | Includes                                                                                                    | Revenue                                          |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Community        | AGPL-3.0, no contract                        | Complete core, self-hosted, no limits                                                                       | None directly; funnel, credibility, contributors |
| Cloud Free       | Terms of service                             | Core with Free limits                                                                                       | 5% platform fee on paid bookings                 |
| Cloud Pro / Team | Terms, monthly or yearly                     | Core with plan limits, managed video and capture                                                            | Subscription + capture overage                   |
| Enterprise       | Order form + Bookly Commercial License + DPA | Core + commercial modules (SSO, SCIM, hiring compliance, ATS/HRIS connectors, residency, audit export), SLA | Annual contract                                  |

## Cost model per workspace per month (fill with real numbers)

| Cost driver                                 | Unit                                       | Source of truth        |
| ------------------------------------------- | ------------------------------------------ | ---------------------- |
| Hosting (Vercel functions, bandwidth)       | per active workspace                       | Vercel invoice         |
| Database (Neon)                             | storage + compute                          | Neon invoice           |
| Queue and rate limit (Upstash QStash/Redis) | messages                                   | Upstash invoice        |
| Email (Resend)                              | per email                                  | Resend invoice         |
| Bookly video (Daily.co)                     | per participant minute                     | Daily invoice          |
| Transcription (Deepgram via Daily)          | per audio minute                           | Daily/Deepgram invoice |
| Notetaker for external calls (Recall.ai)    | per bot hour                               | Recall invoice         |
| AI (Anthropic)                              | per briefing / recap / draft (tokens)      | Anthropic console      |
| File storage (S3-compatible)                | GB-month                                   | storage invoice        |
| Payments (Stripe)                           | % + fixed per charge; Billing and Tax fees | Stripe                 |
| Error tracking (Sentry)                     | events                                     | Sentry invoice         |

Check: capture overage at $3 an hour must exceed (Recall or Daily) + transcription + AI recap
cost per hour with margin. The Pro allowance (5 h) and Team allowance (8 h per member) set the
worst-case cost of a fully used plan; model it.

## Metric definitions

- **MRR:** sum of active subscriptions normalised to a month (yearly / 12), excluding one-off
  overage; report overage separately as usage revenue.
- **Net new MRR** = new + expansion − contraction − churned.
- **GRR** = (starting MRR − contraction − churn) / starting MRR, over 12 months.
- **NRR** = (starting MRR + expansion − contraction − churn) / starting MRR, over 12 months.
- **Logo churn:** paying workspaces lost in the month / paying workspaces at start.
- **ARPA:** MRR / paying workspaces.
- **Free → paid conversion:** workspaces that start a paid plan within 90 days of sign-up /
  sign-ups in the cohort.
- **CAC:** sales and marketing spend in the period / new paying workspaces in the period, per
  channel when attributable.
- **CAC payback (months)** = CAC / (ARPA × gross margin %).
- **Gross margin** = (revenue − cost of serving from the table above) / revenue.

## Market sizing approach

Bottom-up only; top-down "the HR tech market is $X bn" figures are not decisions.

- Client work: number of independent consultants, coaches, advisors and small agencies in target
  countries × share who sell time through meetings × willingness to pay (Pro/Team ARPA).
- Hiring: small and mid-size employers hiring each year + organisations running cohorts,
  fellowships, grants, admissions, volunteer intakes × seats × ARPA.
- State sources and dates for every input; keep the model in `planning/business/`.
