# Privacy surface: where it lives

Paths verified on branch `v2` (2026-10-24).

## Public legal pages (cloud platform host)

| Page             | File                                                    | Notes                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy   | `apps/web/src/app/(platform)/platform/privacy/page.tsx` | Sections: who we are, two kinds of people (account holders vs guests), what we collect, why, who else sees it, Google user data, retention, rights, cookies, transfers, children, changes |
| Terms of service | `.../terms/page.tsx`                                    | 14 sections; §5 regulated data (no HIPAA, no cards, no children), §8 AI features, §13 governing law                                                                                       |
| DPA              | `.../dpa/page.tsx`                                      | Processor terms; `SUBPROCESSORS` array (name, purpose, location), all US today; "no signature needed, signed copy on request"                                                             |
| Security         | `.../security/page.tsx`                                 | Open source, transit/rest, auth, video, transcripts and consent, hardening, rights, reporting                                                                                             |
| Constants        | `.../site.ts`                                           | `SITE.operator` = Cloudeo Solutions, LLC; `operatorAddress` from `OPERATOR_ADDRESS`; `legalUpdated` doubles as consent version                                                            |

Changing any of them: draft first, apply after approval, bump `legalUpdated`, changelog entry.

## Consent and rights in code

| Concern                             | Where                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terms/privacy acceptance at sign-up | `platform/signup/signup-form.tsx` sends `consentVersion`; `lib/auth.ts` stores `consentAt`, `consentVersion`; invitations in `accept-invitation/[id]/accept-form.tsx`       |
| Who accepted which version          | Console → Users (`platform/console/users/page.tsx`)                                                                                                                         |
| Recording/transcription consent     | `server/consent.ts`, `server/consent-actions.ts`, capture docs in `docs/contacts.md`                                                                                        |
| Export and deletion                 | `server/data-rights.ts` (`exportWorkspace`, deletion helpers), Admin → Settings → Data                                                                                      |
| Unsubscribe                         | `server/unsubscribe.ts`, `/unsubscribe/[token]`, `/api/unsubscribe/[token]`, one-click `List-Unsubscribe`                                                                   |
| Error-report scrubbing              | `lib/scrub.ts`, `lib/sentry.ts`                                                                                                                                             |
| AI labelling                        | `components/ai-label.tsx`                                                                                                                                                   |
| Telemetry                           | `TELEMETRY` in `packages/config/src/index.ts`: daily update check **on by default** (anonymous install id, version); usage counts are a separate opt-in in Admin → Settings |

## Gaps to plan for v2

- No candidate privacy notice, application retention or self-ID separation exists yet (hiring is
  new).
- No EU data residency; all processing in the US.
- DPA is click-through; Enterprise customers will ask for a signed version with SCCs and a
  transfer impact assessment.
- No i18n: notices and consent copy are English only; global launch needs translated legal
  notices where local law requires the user's language.
- The telemetry default (on) is fine for a version check but must stay described accurately in
  `.env.example`, the README and the privacy policy.
