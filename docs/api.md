# API & webhooks

## REST API

Base URL: `https://<your-bookly>/api/v1`. Machine-readable spec at `/api/v1/openapi.json`.
Responses are `{ "data": …, "meta": … }` or `{ "error": { "code", "message" } }`.

**Public (no key, 60 requests/min per IP, CORS `*`):**

| Endpoint                                                 | Notes                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /workspace`                                         | Name, timezone and the public booking pages (hosts)                                                           |
| `GET /event-types?username=`                             | Bookable event types with duration, `locations` (the ways to meet) and questions. Hidden ones only with a key |
| `GET /event-types/{username}/{slug}`                     | One event type                                                                                                |
| `GET /availability?username=&event=&timezone=&from=&to=` | Free start times grouped by day in `timezone`; `from`/`to` are `YYYY-MM-DD`, at most 62 days                  |

**Keyed (`Authorization: Bearer bk_…`, 600 requests/min):** create keys with scopes under **Admin → Settings → API**.

| Endpoint                                                                                                                     | Scope                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /bookings?username=&upcoming=1&status=&limit=`                                                                          | `bookings:read`                                                                                                                                                                                                                                                                                                                             |
| `GET /bookings/{id}`                                                                                                         | `bookings:read`                                                                                                                                                                                                                                                                                                                             |
| `POST /bookings` `{ username, event, start, timezone, name, email, phone?, notes?, answers?, location?, address?, guests? }` | `bookings:write` — same validation as the public page; `location` is one of the event type's location types and required when it offers several; a phone location requires a valid `phone` (any format, stored as E.164) and an in-person location without a host address requires `address`; 201 with the booking, 409 if the slot is gone |
| `POST /bookings/{id}/cancel` `{ reason?, by? }`                                                                              | `bookings:write`                                                                                                                                                                                                                                                                                                                            |
| `POST /bookings/{id}/reschedule` `{ start, timezone? }`                                                                      | `bookings:write` — returns the replacement booking (201)                                                                                                                                                                                                                                                                                    |

`answers` is keyed by question id (from the event type) or by label. Required questions must be
answered. `guests` is a list of colleagues' emails, accepted up to the event type's `maxGuests`;
bookings expose them as `guests`. Keys are hashed at rest and shown once; revoke from the admin.

Typical assistant flow: `GET /event-types` → `GET /availability` → `POST /bookings`.

### Group sessions and series

- Event types carry `seats` (attendees per slot) and `recurrence` (`{ freq, interval, count }` or `null`).
- `GET /availability` adds `seatsLeft` per day (`{ "<start ISO>": n }`) for group event types.
- `POST /bookings` on a recurring event type books the whole series and returns the first booking; `meta.skipped` lists occurrences the host could not take. Each booking exposes `series: { id, index, count }`.

### Contacts and tasks

- Hiring data stays out of the API until it gets its own `hiring:read` and `hiring:write` scopes: people who exist only as candidates are not listed by `GET /contacts`, interviews appear in `GET /bookings` as "Interview" with no attendee details, and `GET /bookings/{id}` answers `404` for an interview.
- `GET /contacts?q=&stage=&stageId=&limit=` (scope `bookings:read`) and `POST /contacts` (scope `bookings:write`, body `{ email, name?, company?, phone?, tags?, stage?, stageId?, notes? }`, upsert by email). `stage` is a stage key of the workspace's client pipeline (`lead`, `active`, `won`, `lost` or one the workspace added, such as `proposal-sent`); an unknown key or id is a `400`. Each contact carries `stageId`, `stageKey` and `stageName` next to the classic `stage` (`lead`, `active`, `won` or `lost`, which an added open stage reads as `lead`; it goes in 1.1).
- `GET /pipelines` (scope `bookings:read`): the client pipeline and its stages in order, each `{ id, key, name, category, color, isEntry, priorityScheduling }`. Keys are stable across renames.
- `GET /tasks?contactId=&limit=` (scope `bookings:read`): open tasks, soonest due first.

## Webhooks

Add an endpoint under **Admin → Settings → API** and choose events: `booking.created`,
`booking.confirmed` (host approved a pending booking), `booking.cancelled`, `booking.rescheduled`
(sent together with `booking.created` for the replacement; carries `previousBookingId`). Use
**Ping** to send a test delivery.

`opportunity.published` (hiring beta) carries `{ id, title, type, slug, opensAt, closesAt,
decidesBy }` when an opportunity is published. `application.submitted` carries `{ id,
opportunityId, cohortId, stage: { key, category }, submittedAt }` and `application.withdrawn`
`{ id, opportunityId, withdrawnAt }`. `application.stage_changed` carries `{ id, opportunityId,
from: { key, category } | null, to: { key, category }, by }` when a coordinator (`by: "user"`) or a
stage rule (`by: "rule"`) moves an application. Hiring webhooks carry ids only, never applicant data.

`contact.stage_changed` carries `{ contact, from, to, by, fromStage, toStage }`. `from` and `to`
are the four classic values (`lead`, `active`, `won`, `lost`); `fromStage` and `toStage` are the
stages of the workspace's client pipeline, `{ id, key, name, category }` (`fromStage` is `null`
the first time). Prefer the stage objects: from 1.0 a workspace can rename stages and
add its own, which `from`/`to` only approximate (an open stage reads as `lead`, a won stage as
`won`), and 1.1 drops them.

Each delivery is a `POST` with JSON `{ id, event, createdAt, data: { booking, … } }` and headers
`X-Bookly-Event`, `X-Bookly-Delivery`, and `X-Bookly-Signature: t=<unix>,v1=<hex>` where
`v1 = HMAC-SHA256(secret, "<t>.<raw body>")`. Reject deliveries whose `t` is older than 5
minutes. Respond 2xx within 10 seconds; failures are retried with backoff (1, 5, 30, 120, 720
minutes) by the worker or the cron tick, and can be retried manually from the admin.

Verify in Node:

```js
import { createHmac } from "node:crypto";
const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const ok = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex") === v1;
```
