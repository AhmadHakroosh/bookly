# Growth plan

## Funnel and metrics

| Step      | Definition                                                                                   | Where measured                                       |
| --------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Visit     | Marketing host session                                                                       | Cookieless analytics on the platform host (to build) |
| Sign-up   | Account + workspace created (`platform/signup`)                                              | Database (users, workspaces)                         |
| Activated | First external booking (Client work) or first application received (Hiring) within 7/14 days | Database                                             |
| Engaged   | Weekly active host or reviewer in week 4                                                     | Database                                             |
| Paid      | Active Pro/Team/Enterprise subscription                                                      | Stripe mirror on workspaces                          |
| Install   | Self-hosted install seen by the update check in the last 30 days                             | Console → Installs                                   |
| Community | GitHub stars, contributors (after the CLA), issues                                           | GitHub                                               |

## Channels, in priority order

1. **Product loops.** "Powered by Bookly" on Free booking pages and emails; every booking and
   application page is seen by people who may need Bookly themselves (guests are consultants'
   clients; candidates and reviewers are future hiring managers). Make the line link to a
   short, relevant landing page with UTM-free, privacy-safe referral attribution (a `ref`
   parameter recorded only on sign-up).
2. **Search.** Pages by job-to-be-done ("booking page with payments", "meeting notes with
   consent", "fellowship application software", "cohort review process", "volunteer intake
   scheduling"), solution pages per audience, comparison and alternative pages, and the docs
   (already sitemapped). Technical SEO health: canonical, OG, JSON-LD, sitemaps, Core Web
   Vitals.
3. **Open-source community.** GitHub README in the 02 identity, good first issues (after the
   CLA), self-hosting guides for popular platforms (Docker, Coolify, Railway, Vercel), Show HN
   at v2 launch, presence in awesome-selfhosted style lists, release notes per version.
4. **Content and templates.** Hiring templates as content: "fellowship review rubric",
   "structured interview scorecard", "volunteer orientation booking"; each one importable as an
   opportunity template.
5. **Partnerships.** Communities of coaches and consultants, accelerator and fellowship
   networks, nonprofit tech programs (discounts via `bookly-business`).
6. **Paid** only after the trademark question is settled and organic conversion is known.

## Internationalisation and localisation (global launch)

Today: English only, no i18n framework; `pageMetadata` sets `locale: "en_US"`; dates and times
are timezone-aware for guests but strings are hard-coded.

Plan (architecture by `bookly-architect`, check Next 16 docs in
`apps/web/node_modules/next/dist/docs/` before choosing):

1. Extract strings for the public surfaces first: booking pages, application pages, emails to
   guests and candidates (they reach people who did not choose Bookly), then admin, then the
   marketing site.
2. Locale per workspace (default for its public pages and emails) and per user (admin UI), with
   the guest's browser language as a hint on public pages.
3. Right-to-left support: logical CSS properties (`ms-`/`me-`, `start`/`end`) in Tailwind,
   `dir="rtl"` on the document, mirrored icons where direction matters. Arabic first (the name
   comes from Arabic بُكْلة), Hebrew next.
4. Formatting through `Intl` (dates, numbers, currency, lists, plurals).
5. Marketing locales: `hreflang` alternates and per-locale sitemaps on the platform host.
6. First wave candidates (validate with data): Spanish, Portuguese (BR), French, German,
   Arabic. Legal pages in a locale only after counsel-reviewed translations.

## Experiment template

```
Name:            Owner:            Dates:
Hypothesis:      If we <change>, <metric> will move from <baseline> to <target> because <reason>.
Variant(s):
Audience / traffic split:
Primary metric:          Guardrail metric:
Minimum sample or time box:
Result:                  Decision: ship | iterate | drop
```

## Content calendar seed

- v2 launch: "Introducing Bookly v2: People. Conversations. Progress."
- "Open core, fair cloud: how Bookly is licensed" (with `bookly-legal-licensing`).
- "Running a fellowship cohort in Bookly" (template + guide).
- "AI summarises, people decide: fairness in Bookly Hiring" (with `bookly-legal-privacy`).
- Comparison pages: Calendly, Cal.com, SavvyCal; Submittable, SurveyMonkey Apply, Workable.
- Monthly changelog roundup from `CHANGELOG.md`.
