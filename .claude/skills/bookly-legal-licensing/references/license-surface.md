# License surface: every place that states a license

Verified by grep on 2026-10-24 (branch `v2`, cut from `main` at 0.20.2). Re-run the commands
before every licensing change; this list goes stale the moment someone writes new copy.

```bash
# Files that mention a license or open source (excludes the lockfile and generated output)
grep -rln -iE "AGPL|open.source|open-source|licen[cs]e" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.turbo --exclude-dir=.git \
  --exclude-dir=planning --exclude-dir=.claude --exclude=pnpm-lock.yaml .

# The lines themselves, minus the license texts and changelog history
grep -rn -iE "AGPL|open.source|open-source|every feature" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.turbo --exclude-dir=.git \
  --exclude-dir=planning --exclude-dir=.claude --exclude=pnpm-lock.yaml \
  --exclude=LICENSE --exclude=CHANGELOG.md .
```

`CHANGELOG.md` mentions are history; never rewrite them.

## Repository files

| File                        | What it says today                                                           | After the shift                                                                           |
| --------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `LICENSE`                   | AGPL-3.0                                                                     | Unchanged (covers everything outside commercial directories)                              |
| `packages/cloud/LICENSE`    | "All rights reserved", read and reference only                               | Elastic License 2.0 text, copyright Cloudeo Solutions, LLC                                |
| `README.md` l.12            | AGPL-3.0 badge                                                               | "License: AGPL-3.0 core" badge (or two badges)                                            |
| `README.md` l.16            | "open-source scheduling platform … every feature is in the open-source core" | "open-core … the core is open source (AGPL-3.0); enterprise modules are source-available" |
| `README.md` l.176–178       | License section: AGPL + `packages/cloud` not open source                     | Three tiers, which directories carry which license, link to commercial license            |
| `CONTRIBUTING.md` l.42      | Contributions licensed under AGPL; cloud contributions core team only        | CLA required; core contributions AGPL + CLA grant; commercial dirs core team only         |
| `package.json` l.4          | `"license": "AGPL-3.0-only"`                                                 | Unchanged for root/core                                                                   |
| `apps/web/package.json` l.5 | `"license": "AGPL-3.0-only"`                                                 | Unchanged                                                                                 |
| `packages/*/package.json`   | no `license` field in any of cloud, config, db, email, jobs, storage         | core packages `"AGPL-3.0-only"`; `packages/cloud` and `ee-*` `"SEE LICENSE IN LICENSE"`   |
| `docs/zoom.md` l.50         | "Bookly is open source; the integration's code is in …"                      | "Bookly's core is open source; …" (the Zoom integration is core)                          |

## App and marketing copy (`apps/web/src/app`)

| File                                    | Line(s)           | Today                                                                                                                                                                     |
| --------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(platform)/platform/site.ts`           | 9                 | `SITE.description`: "Open-source scheduling that …"                                                                                                                       |
| `(platform)/platform/layout.tsx`        | 37, 267           | keyword "open source Calendly alternative"; footer "Open source under AGPL-3.0. Self-host it, or let us run it for you."                                                  |
| `(platform)/platform/page.tsx`          | 143, 259, 573–589 | comparison row "Self-host with every feature, AGPL-licensed"; hero eyebrow "Open source · self-host or let us host it"; "Open source" section "Bookly is AGPL-licensed …" |
| `(platform)/platform/pricing/page.tsx`  | 90, 184           | FAQ "open source under AGPL-3.0 … every feature is unlocked with no limits"; self-host block "every feature unlocked and no limits"                                       |
| `(platform)/platform/about/page.tsx`    | 10, 41–44         | meta description "why it is open source under AGPL-3.0"; section "Open source, by design"                                                                                 |
| `(platform)/platform/security/page.tsx` | 22                | section "Open source"                                                                                                                                                     |
| `(platform)/platform/dpa/page.tsx`      | 74                | "The software is open source, so the customer can inspect exactly …" (still true as "open code")                                                                          |
| `(platform)/platform/terms/page.tsx`    | 18                | lede "The open-source software is licensed separately under the AGPL-3.0."                                                                                                |
| `(platform)/platform/json-ld.tsx`       | 50                | `license: "https://www.gnu.org/licenses/agpl-3.0.html"`                                                                                                                   |
| `(platform)/platform/og/route.tsx`      | 51                | social card label "Open source"                                                                                                                                           |
| `manifest.ts`                           | 8                 | "Open-source scheduling that briefs you …"                                                                                                                                |
| `llms.txt/route.ts`                     | 26                | "Bookly is open-source scheduling software …"                                                                                                                             |
| `emails/layout.tsx`                     | 139               | email footer "…, open source."                                                                                                                                            |

Wording rule for all of them: "open source" may describe the core only; the product as a whole
is "open core" (or "open-source core"). Keep "self-host it" claims true: the AGPL core
self-hosts with no limits; commercial modules need a key.

The pricing promise "every feature unlocked" is true for every released version. For v2 copy,
say "the full core, no limits, no key" and list what the Enterprise license adds.

## Outside this repository

| Place                                                     | Today                                                                                             | After                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/Projects/cloudeo.solutions/src/content/company.ts`     | `license: "AGPL-3.0 core, hosted cloud"`; principle "The software is open source under the AGPL." | "AGPL-3.0 core, source-available enterprise modules, hosted cloud"; principle body adds "Enterprise modules are source-available: every line is published." |
| `cloudeo.solutions` about and products pages              | "open source under the AGPL"                                                                      | Same rephrasing                                                                                                                                             |
| GitHub repo description and topics                        | check by hand                                                                                     | "open-core"                                                                                                                                                 |
| Docker image labels (`org.opencontainers.image.licenses`) | none in `Dockerfile` or `release.yml`                                                             | add `AGPL-3.0-only`; `AGPL-3.0-only AND Elastic-2.0` once commercial code ships in the image                                                                |
