# Threat model template

```
Feature:
Data handled:           (personal? sensitive? recordings? payment? candidate?)
Actors:                 owner · admin/manager · member · assigned reviewer · guest/candidate ·
                        API key · integration webhook · operator · anonymous internet
Entry points:           pages, server actions, /api/v1 routes, webhooks, jobs, emails (inbound), uploads
Trust boundaries:       browser ↔ app · tenant ↔ tenant · app ↔ vendor · app ↔ model

Abuse cases (STRIDE prompts)
- Spoofing:             can someone act as another member/guest/webhook sender?
- Tampering:            can a client-supplied id/stage/score change data it should not?
- Repudiation:          is every write audited (audit()) with the right actor?
- Information disclosure: cross-tenant reads, reviewer sees others' reviews, sensitive fields leak
                        to export/webhook/AI/logs, enumeration via error differences
- Denial of service:    unbounded queries, uploads, application spam, model cost blow-up
- Elevation:            member → admin, guest → member, API scope bypass, operator impersonation

Mitigations and the test that proves each:
| Risk | Mitigation | Test |
|------|------------|------|

Residual risk and owner:
```
