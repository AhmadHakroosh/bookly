# Test plan template

```
Feature / slice:
Branch:                       (v2-<area>-<topic>)
Flag:                         (key in server/flags.ts, or none)
Plans affected:               (Free / Pro / Team / self-hosted / Enterprise module)

Risks (what would hurt a user most if it broke):
1.
2.

Cases
| # | Case | Layer (unit/e2e/cloud/manual) | File | Status |
|---|------|-------------------------------|------|--------|

Tenancy check:                (which test proves another workspace cannot see it)
Access check:                 (roles: owner, admin/manager, member, assigned reviewer, guest)
Time check:                   (zones, DST, recurrence, if relevant)
a11y:                         (page added to a11y.spec.ts; keyboard path written down)
Themes / viewport:            (light, dark, 375 px)
Data:                         (demo seed additions needed in apps/web/scripts/demo.ts?)
AI:                           (no-key fallback tested; prompt excludes sensitive fields)
Docs/changelog checked:       yes / no
```
