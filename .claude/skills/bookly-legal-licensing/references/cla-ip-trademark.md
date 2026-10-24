# CLA, IP ownership, trademark and dependency compliance

DRAFT — for review by qualified counsel. Not legal advice.

## 1. IP ownership (do first)

Facts: `git shortlog -sne --all` shows 497 commits by Ahmad Hakroosh and 15 by Dependabot; no
other human author. `packages/cloud/LICENSE` names "Ahmad Hakroosh" as copyright holder, while
the hosted service, terms and invoices are in the name of Cloudeo Solutions, LLC
(`SITE.operator` in `apps/web/src/app/(platform)/platform/site.ts`).

The company sells a commercial license and the cloud; it should own the code it licenses.

- Draft an **IP assignment agreement**: founder assigns all copyright, moral-rights waivers where
  allowed, and any marks and domains (`bookly-app.io`) relating to Bookly to Cloudeo Solutions,
  LLC, with a license-back if the founder wants personal reuse rights.
- Inventory what is assigned: this repository, design files (including the v2 brand
  explorations in `planning/v2/concepts/`), domains, GitHub org/repo, app-store and social
  handles.
- If any designer or contractor produced the v2 logo or UI concepts, get a written assignment
  from them too before the 02 mark is registered or used commercially.
- After signing: update copyright lines (`packages/cloud/LICENSE`, footers, `SITE.maker` stays
  as credit only) in one commit, note it in the changelog.

## 2. Contributor License Agreement

Why: under inbound=outbound AGPL contributions, the company could not include a contributor's
core code in a commercially licensed build or relicense later. A CLA keeps that option and keeps
one owner.

- Type: **license grant** (Apache ICLA/CCLA style), not copyright assignment. Contributors keep
  copyright; they grant Cloudeo Solutions, LLC a perpetual, worldwide, irrevocable license to
  use, sublicense and relicense, plus a patent license, and confirm they have the right to
  contribute (employer consent for the corporate version).
- Commitment back to the community, stated in the CLA and CONTRIBUTING: the contribution will
  always also be available under the AGPL-3.0 in the core.
- Tooling: CLA Assistant (GitHub app) or a signed-commit workflow; make the check required in
  branch protection for `main` and `v2`. DCO alone is not enough for relicensing.
- Text location: `planning/legal/cla-individual.md`, `planning/legal/cla-corporate.md` while in
  draft; `CLA.md` in the repo (to build) once approved.
- Dependabot and other bots are exempt in the CLA Assistant allowlist.

## 3. Trademark: "Bookly"

Risk: an established WordPress appointment-booking plugin and SaaS has traded as "Bookly" for
years, in the same goods and services (scheduling software, Nice classes 9 and 42). Before global
marketing that is a likely conflict, not a formality. Verify; do not assume either way.

Clearance steps (counsel runs them; you prepare the brief):

1. Knock-out search: USPTO (TESS successor search), EUIPO eSearch, UKIPO, WIPO Global Brand
   Database (Madrid), plus the founder's other target markets.
2. Common-law use: app stores, WordPress.org plugin directory, domains, company registries.
3. Classes to check: 9 (downloadable software), 35 (business/recruitment services when hiring
   ships), 38 (video conferencing), 42 (SaaS).
4. Outcome options, cheapest first: coexistence with a distinguishing compound mark (for example
   a registered logo mark for the 02 "b" plus a qualifier), a negotiated coexistence agreement,
   or a rename before launch. The cost of renaming grows with every campaign, so decide before
   paid acquisition.
5. File for the 02 logo mark separately from the word mark; a design mark may be registrable even
   where the word is crowded.

**Trademark policy** (to draft, `TRADEMARKS.md`): forks may say "based on Bookly", may not use
the name or the 02 mark as their product name or logo, may not imply endorsement; unmodified
self-hosted installs may keep the "Powered by Bookly" line. The AGPL grants copyright, not
trademark rights; say so.

## 4. Third-party dependency compliance

- The AGPL core can include MIT/BSD/Apache-2.0/ISC/MPL-2.0 dependencies. GPL-2.0-only code is
  incompatible with AGPL-3.0; flag any.
- Commercial modules must not pull in copyleft (GPL/AGPL/LGPL linked statically) dependencies
  beyond the core they already sit on; check each `packages/ee-*` dependency.
- Build a license scan in CI (to build; for example `license-checker` or `pnpm licenses list`
  with an allowlist) and generate `THIRD_PARTY_NOTICES` into the Docker image.
- Fonts and brand assets: Geist is under the SIL Open Font License; keep its notice when it is
  bundled. Anything the v2 identity licenses (icon sets, stock photos in marketing mocks) needs a
  recorded license before shipping.
- Sub-processor SDKs (Stripe, Daily, Anthropic, Resend) are services, not license questions; they
  belong to `bookly-legal-privacy`.

## 5. Order of operations

1. IP assignment signed.
2. Elastic License 2.0 confirmed by counsel; `packages/cloud/LICENSE` replaced.
3. CLA approved, tooling required on `main` and `v2`, CONTRIBUTING updated.
4. Copy changes across the license surface in one PR (see `license-surface.md`).
5. Trademark clearance opinion before paid global marketing; `TRADEMARKS.md` published.
6. License scan and notices in CI before the first Enterprise customer.
