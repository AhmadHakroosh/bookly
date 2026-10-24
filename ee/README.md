# Bookly Enterprise modules

Commercial modules of Bookly, published so anyone can read every line that runs ("open code"),
licensed under the [Elastic License 2.0](LICENSE). They work only with a Bookly license key. The
rest of Bookly is open source under the AGPL v3 and complete without anything in this directory.

| Module                   | Package                | What it does                                                        |
| ------------------------ | ---------------------- | ------------------------------------------------------------------- |
| [`licensing`](licensing) | `@bookly/ee-licensing` | Verifies license keys offline (Ed25519); issues them (Cloudeo only) |

More modules arrive with Bookly 1.x: single sign-on and SCIM, compliance reports, per-region
retention policies, ATS/HRIS connectors.

## How it fits together

- The core never imports this directory. `scripts/ee-registry.mjs` writes
  `apps/web/src/server/editions/registry.generated.ts` with the modules it finds here, and core
  asks `hasEe(workspace, feature)` (`apps/web/src/server/editions.ts`) before using one. The
  contract is `@bookly/editions` (AGPL).
- Delete `ee/` and the registry is empty: Bookly builds, tests and runs as the Community edition.
  CI checks this on every push (`core-only` job).
- A license key (`BOOKLY_LICENSE_KEY`, `BOOKLY_LICENSE_FILE`, or pasted under Admin → Settings →
  License) is checked on the server against the public keys in `licensing/src/keys.ts`. No network
  call, ever. After expiry a grace period applies; after that, features stop safely: nothing is
  deleted or locked, and data stays exportable through the core.

## Contributing

Changes here come from the core team only, under the contributor license agreement. Every source
file starts with `// SPDX-License-Identifier: Elastic-2.0` (checked by
`apps/web/src/__tests__/editions-boundary.test.ts`).
