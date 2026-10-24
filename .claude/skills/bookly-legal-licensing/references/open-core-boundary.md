# Open-core boundary

DRAFT — for review by qualified counsel and the founder. Not legal advice.

## Where Bookly stands today

- `LICENSE`: GNU AGPL-3.0 for the whole repository.
- `packages/cloud/LICENSE`: "Bookly Cloud — Copyright (c) 2026 Ahmad Hakroosh. All rights
  reserved." Published for transparency, may be read and referenced, may not be used to operate
  a hosted service for third parties. This is already a source-available module and the model
  for the commercial license.
- `README.md` promises "every feature is in the open-source core", and the pricing FAQ says a
  self-hosted install has "every feature unlocked and no limits". Those promises hold for every
  version already released and must be rephrased, not silently broken, for v2.
- Cloudeo (`company.ts`): principle "Open core, fair cloud" and product license string
  "AGPL-3.0 core, hosted cloud".

## The model

| Tier           | License                        | Who                                 | What they get                                        |
| -------------- | ------------------------------ | ----------------------------------- | ---------------------------------------------------- |
| **Community**  | AGPL-3.0                       | Anyone, self-hosted                 | The complete core, no limits, no key                 |
| **Cloud**      | Terms of service (+ AGPL core) | Free / Pro / Team on bookly-app.io  | Core run for them, plan limits from `packages/cloud` |
| **Enterprise** | Bookly Commercial License      | Organisations, cloud or self-hosted | Core + commercial modules, license key, SLA, DPA     |

"Open code" across all three: the source of every module, commercial ones included, is
published in the repository.

## Four placement tests (apply in order; the first decisive one wins)

1. **Shipped-already test.** Was it in a tagged release under AGPL? Then it is core. Full stop.
2. **Single-team completeness test.** Does one team running Bookly for itself need it to do its
   job (book, meet, follow up, hire)? Then core.
3. **Buyer test.** Is the feature asked for by an organisation's IT, security, legal or HR
   compliance function rather than by the person doing the work (SSO, SCIM, audit export,
   retention policies, regional residency, bias reporting)? Then commercial.
4. **Operator test.** Does it exist only to run Bookly as a business for many tenants (plans,
   billing, metering, operator console extras)? Then commercial (`packages/cloud`).

If none decides, default to **core** and record why.

## Draft placement

| Area                  | Core (AGPL-3.0)                                                                                            | Commercial (source-available)                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Scheduling            | Booking pages, event types, availability, routing, group/recurring/round-robin, payments, calendars, video | —                                                                                                      |
| People & work         | Contacts/people, pipelines, messages, tasks, files, notifications, Home                                    | —                                                                                                      |
| Capture & AI          | Capture, recaps, briefings with the operator's own AI key                                                  | Managed AI quotas are a cloud plan feature, not a license matter                                       |
| Hiring                | Opportunities, applications, stages, application pages, interviews, structured reviews, decisions, cohorts | Anonymised review, adverse-impact / EEO reporting, LL 144 audit support, per-region retention policies |
| Identity & admin      | Email/password, magic link, passkeys, roles owner/admin/member                                             | SAML/OIDC SSO, SCIM, directory sync, custom roles, org-wide multi-workspace admin                      |
| Integrations          | Google, Microsoft, Zoom, Stripe, HubSpot, Pipedrive, API v1, webhooks                                      | ATS/HRIS connectors (Greenhouse, Lever, Workday, Personio, BambooHR)                                   |
| Governance            | Workspace activity log                                                                                     | Audit export to SIEM, long retention, legal hold                                                       |
| Operating the service | Self-host, `TENANCY=single`, `TENANCY=multi` routing                                                       | `packages/cloud` plans, billing, metering; operator console extras                                     |

Open questions:

- Is `TENANCY=multi` itself core? Today the multi-tenant routing is AGPL and only plans/billing
  are in `packages/cloud`. Keeping it core is consistent with the shipped-already test.
- Do HubSpot/Pipedrive (shipped, core) set a precedent that ATS connectors should be core too?
  The buyer test says commercial; record the reasoning.
- Hiring compliance features may be legally _required_ for some customers (NYC, EU). Putting a
  legal requirement behind a paywall needs a product and ethics decision, not only a license
  decision.

## The Bookly Commercial License (to draft)

Model on established source-available terms (for example the Cal.com `/ee` and GitLab EE
licenses) and `packages/cloud/LICENSE`. Must cover:

- Copyright: Cloudeo Solutions, LLC (after the IP assignment).
- Permitted without a subscription: reading, modifying and running for development and testing.
- Production use: only with a valid subscription or license key for the number of seats paid.
- No redistribution or offering as a hosted service to third parties.
- Contributions to commercial directories: core team only (as CONTRIBUTING.md says today for
  `packages/cloud`).
- Relationship to AGPL: core files stay AGPL; the commercial license applies only to files in
  directories that carry it.

## Repository layout (for the architect)

```
LICENSE                       AGPL-3.0 (unchanged)
packages/cloud/LICENSE        Bookly Commercial License (replaces today's text)
packages/ee-<module>/LICENSE  Bookly Commercial License
NOTICE / THIRD_PARTY_NOTICES  to build
```

SPDX headers: core files `// SPDX-License-Identifier: AGPL-3.0-only`; commercial files
`// SPDX-License-Identifier: LicenseRef-Bookly-Commercial`. Add to new files immediately; backfill
existing files in one mechanical commit.

## Decision log

| Date | Module | Placement | Deciding test | Notes |
| ---- | ------ | --------- | ------------- | ----- |
|      |        |           |               |       |
