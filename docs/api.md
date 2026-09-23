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

**Keyed (`Authorization: Bearer bk_…`, 600 requests/min):** create keys with scopes under **Admin → API & webhooks**.

| Endpoint                                                                                                            | Scope                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /bookings?username=&upcoming=1&status=&limit=`                                                                 | `bookings:read`                                                                                                                                                                                                                                                                                                                             |
| `GET /bookings/{id}`                                                                                                | `bookings:read`                                                                                                                                                                                                                                                                                                                             |
| `POST /bookings` `{ username, event, start, timezone, name, email, phone?, notes?, answers?, location?, address? }` | `bookings:write` — same validation as the public page; `location` is one of the event type's location types and required when it offers several; a phone location requires a valid `phone` (any format, stored as E.164) and an in-person location without a host address requires `address`; 201 with the booking, 409 if the slot is gone |
| `POST /bookings/{id}/cancel` `{ reason?, by? }`                                                                     | `bookings:write`                                                                                                                                                                                                                                                                                                                            |
| `POST /bookings/{id}/reschedule` `{ start, timezone? }`                                                             | `bookings:write` — returns the replacement booking (201)                                                                                                                                                                                                                                                                                    |

`answers` is keyed by question id (from the event type) or by label. Required questions must be
answered. Keys are hashed at rest and shown once; revoke from the admin.

Typical assistant flow: `GET /event-types` → `GET /availability` → `POST /bookings`.

### Group sessions and series

- Event types carry `seats` (attendees per slot) and `recurrence` (`{ freq, interval, count }` or `null`).
- `GET /availability` adds `seatsLeft` per day (`{ "<start ISO>": n }`) for group event types.
- `POST /bookings` on a recurring event type books the whole series and returns the first booking; `meta.skipped` lists occurrences the host could not take. Each booking exposes `series: { id, index, count }`.

### Contacts and tasks

- `GET /contacts?q=&stage=&limit=` (scope `bookings:read`) and `POST /contacts` (scope `bookings:write`, body `{ email, name?, company?, phone?, tags?, stage?, notes? }`, upsert by email).
- `GET /tasks?contactId=&limit=` (scope `bookings:read`): open tasks, soonest due first.

## Webhooks

Add an endpoint under **Admin → API & webhooks** and choose events: `booking.created`,
`booking.confirmed` (host approved a pending booking), `booking.cancelled`, `booking.rescheduled`
(sent together with `booking.created` for the replacement; carries `previousBookingId`). Use
**Ping** to send a test delivery.

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
