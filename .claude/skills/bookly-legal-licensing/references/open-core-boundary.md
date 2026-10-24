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

| Tier           | License                            | Who                                 | What they get                                        |
| -------------- | ---------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| **Community**  | AGPL-3.0                           | Anyone, self-hosted                 | The complete core, no limits, no key                 |
| **Cloud**      | Terms of service (+ AGPL core)     | Free / Pro / Team on bookly-app.io  | Core run for them, plan limits from `packages/cloud` |
| **Enterprise** | Elastic License 2.0 (+ order form) | Organisations, cloud or self-hosted | Core + commercial modules, license key, SLA, DPA     |

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

## The commercial license: Elastic License 2.0 (decided 2026-10-24)

Decided by `bookly-business` + `bookly-legal-licensing` at the founder's request. DRAFT reasoning
for counsel to confirm before the first commercial module ships.

| Option                                        | Production use of paid features without paying                    | Blocks a competing hosted service | Drafting cost / procurement familiarity              | Verdict                                     |
| --------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Custom EE license (GitLab EE / Cal.com style) | No (subscription clause)                                          | Yes                               | High / medium (each buyer's lawyer reads a new text) | Fallback                                    |
| **Elastic License 2.0**                       | No, with license-key gating (circumventing the key is prohibited) | Yes (no managed service)          | None / high (widely reviewed)                        | **Chosen**                                  |
| Functional Source License (FSL)               | **Yes**: any non-competing use, internal production included      | Yes (competing use only)          | None / medium                                        | Rejected: gives enterprise features away    |
| Business Source License (BUSL)                | Depends on the Additional Use Grant                               | Yes                               | Medium / medium                                      | Rejected: per-release change dates add work |

Why ELv2: one standard text covers both commercial directories. `packages/cloud` needs "no
competing hosted service" (today's custom wording says the same). `ee/` needs "pay to use"
(license-key gating, and the license forbids getting around it). It is short and well known to
enterprise procurement, and it is source-available, which fits Cloudeo's "open code" principle.

What the code must do for ELv2 to work:

- Every `ee/` feature checks a valid, signed license key (offline-verifiable, seat count,
  expiry, grace period). No key, no feature. Cloud workspaces get the entitlement from their plan.
- Free development/trial keys on request, so evaluation stays easy.
- The core builds and runs with `ee/` deleted. Forks that redistribute the AGPL core drop `ee/`
  unless they hold a license (counsel to confirm the AGPL/ELv2 combination wording in README).
- Copyright notices name Cloudeo Solutions, LLC (after the IP assignment).
- Contributions to commercial directories: core team only, under the CLA.

## Repository layout (for the architect)

```
LICENSE                       AGPL-3.0 (unchanged)
packages/cloud/LICENSE        Elastic License 2.0 (replaces today's text)
ee/LICENSE (or packages/ee-*)  Elastic License 2.0
NOTICE / THIRD_PARTY_NOTICES  to build
```

SPDX headers: core files `// SPDX-License-Identifier: AGPL-3.0-only`; commercial files
`// SPDX-License-Identifier: Elastic-2.0`. Add to new files immediately; backfill
existing files in one mechanical commit.

## Decision log

| Date       | Module                    | Placement | Deciding test | Notes                               |
| ---------- | ------------------------- | --------- | ------------- | ----------------------------------- |
| 2026-10-24 | Commercial license choice | ELv2      | n.a.          | See table above; counsel to confirm |
