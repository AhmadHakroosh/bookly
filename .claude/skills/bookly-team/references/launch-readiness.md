# Launch readiness review

Run before a feature leaves beta, before a release, and before any public launch. Report each
line as pass / fail / n.a. with evidence (file, PR, screenshot, command output).

## Product and UX

- [ ] Spec with success metric exists; the metric is instrumented.
- [ ] Every screen has its empty, loading, error, no-permission and plan-limited states.
- [ ] Copy reviewed (sentence case, verbs on buttons, errors say how to fix).
- [ ] Works at 375 px and in dark mode; screenshots attached.

## Engineering

- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass.
- [ ] e2e: `pnpm --filter @bookly/web e2e` (and `e2e:cloud` if the platform host is touched).
- [ ] axe passes for new pages (`a11y.spec.ts`).
- [ ] Migrations additive; tested on a copy of production-shaped data; rollback noted.
- [ ] Every write calls `audit()`; `audit-coverage.test.ts` passes.
- [ ] Tenant isolation reviewed (every query scoped by `workspace_id`).
- [ ] New env vars in `packages/config` and `.env.example`.
- [ ] Behind a flag until this review passes; flag plan (beta cohort → on) written.

## Security and privacy

- [ ] Threat notes for new inputs, uploads, webhooks, public pages.
- [ ] Personal data inventory updated (what, why, retention, who sees it).
- [ ] Sub-processors unchanged, or `/dpa` updated and customers notified.
- [ ] AI features labelled AI-generated; no AI decision on people (hiring guardrails).

## Legal and licensing

- [ ] Code lives on the right side of the open-core boundary (AGPL core vs commercial dir).
- [ ] Third-party dependencies' licenses compatible; notices updated.
- [ ] Terms/privacy changes bump `legalUpdated` (consent versioning).
- [ ] Marketing claims checked (no "GDPR certified", no unverifiable superlatives).

## Go-to-market

- [ ] `docs/` page written; `CHANGELOG.md` entry under Unreleased.
- [ ] Landing/solution page and pricing page reflect the feature and its plan.
- [ ] Support notes and known issues for `bookly-sales-success`.
- [ ] Launch message and channels planned (`bookly-brand-marketing`, `bookly-growth-marketing`).

## Operations

- [ ] Deploy plan (Vercel + QStash for cloud; image tag for self-host) and rollback trigger.
- [ ] Alerts/Sentry for new failure modes; Console → Health covers new jobs.
