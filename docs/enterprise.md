# Bookly Enterprise

Bookly is open core. Everything a team needs to book, meet, follow up and (from 1.0) hire is open
source under the AGPL v3 and works without a license. Bookly Enterprise adds commercial modules
for organizations: single sign-on and SCIM, custom roles, compliance reports, per-region
retention policies and connectors. Their code lives in `ee/`, readable by anyone, under the
[Elastic License 2.0](https://www.elastic.co/licensing/elastic-license).

No commercial module ships yet; this page explains how licensing works so installs are ready.

## License keys

A key looks like `bookly_lic_1.…`. Give it to Bookly in one of three ways (the first that is set
wins):

1. `BOOKLY_LICENSE_KEY` in the environment.
2. `BOOKLY_LICENSE_FILE`: a path to a file holding the key (Docker or Kubernetes secrets).
3. **Admin → Settings → License**: the workspace owner pastes it; it is stored encrypted.

The key is checked on your server against Bookly's public key. Nothing is sent anywhere: no
activation, no phone-home, no usage reporting.

A key names the customer, the edition (enterprise, trial or development), the features, the
number of seats and its expiry. Admin → Settings → License shows all of it.

## Expiry and grace

- Admin → Settings → License shows how many days are left.
- After expiry, a grace period (30 days for enterprise keys, none for trials) keeps everything
  working with a banner.
- After the grace period, commercial features stop safely: nothing is deleted or locked, data
  created with them stays readable and exportable through the open-source core, and owners and
  admins can always sign in with a password or magic link even if single sign-on was enforced.

Seats over the licensed number show a warning; they never block anyone.

## Trials and development

Development and 30-day trial keys are free. Ask at the support address on the
[contact page](https://bookly-app.io/contact).

## The Community edition

Delete `ee/` and Bookly builds and runs as the Community edition with
every open-source feature. Bookly's CI checks this on every change.

## On the hosted service

Workspaces on bookly-app.io get commercial features from their plan or, for Enterprise contracts,
from grants the operator sets on the workspace in the console.
