# Release regression list

Run before tagging a release (automated where a spec exists; manual otherwise). Add a line when a
bug escapes.

## Self-host path

- [ ] `docker compose --profile app up -d` on a fresh volume: migrations on boot, `/api/health`
      OK, setup wizard appears (CI `docker` job covers the smoke test)
- [ ] Upgrade from the previous release image with data: migrations apply, nothing lost

## Scheduling (e2e: booking.spec.ts, group-session.spec.ts)

- [ ] Book, reschedule, cancel as a guest; confirmation and reminder emails render
- [ ] Group session seats and waitlist; recurring series
- [ ] Routing form routes to the right event/host
- [ ] Paid booking in Stripe test mode (manual)
- [ ] Embed widget on an external page (manual)

## Client work (e2e: admin, tasks, messages, files, timeline, notes)

- [ ] Home shows today, follow-ups, tasks, recaps to review
- [ ] Contact timeline, tasks list/board, messages, drive
- [ ] Capture + recap with and without `ANTHROPIC_API_KEY`

## Hiring (to build with the feature)

- [ ] Application page submit, pipeline moves, reviews visibility, interviews, decisions,
      candidate export/deletion, retention

## Cloud (cloud.spec.ts)

- [ ] Marketing pages, sign-up with consent, tenant booking on a subdomain, workspace chooser,
      operator console, plan gates, Stripe checkout (test mode, manual)

## Cross-cutting

- [ ] a11y spec green; dark mode spot check; 375 px width on booking page and Home
- [ ] Security headers spec green
- [ ] API v1 smoke with a scoped key; webhook delivery signed
