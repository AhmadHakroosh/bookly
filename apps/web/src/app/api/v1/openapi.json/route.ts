import { loadEnv } from "@bookly/config";
import { CORS } from "@/server/api";

const str = { type: "string" };
const nstr = { type: "string", nullable: true };
const eventType = {
  type: "object",
  properties: {
    id: str,
    slug: str,
    url: str,
    title: str,
    description: nstr,
    durationMin: { type: "integer" },
    minNoticeMin: { type: "integer" },
    maxDaysAhead: { type: "integer" },
    location: { type: "object", properties: { type: str, label: str } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str,
          label: str,
          type: { type: "string", enum: ["text", "textarea", "email", "phone", "select"] },
          required: { type: "boolean" },
          options: { type: "array", nullable: true, items: str },
        },
      },
    },
    requiresConfirmation: { type: "boolean" },
    hidden: { type: "boolean" },
    price: {
      type: "object",
      nullable: true,
      properties: { cents: { type: "integer" }, currency: nstr },
    },
    host: { type: "object", properties: { username: str, name: str } },
  },
};
const booking = {
  type: "object",
  properties: {
    id: str,
    status: {
      type: "string",
      enum: ["pending", "confirmed", "cancelled", "rescheduled", "completed", "no_show"],
    },
    start: { type: "string", format: "date-time" },
    end: { type: "string", format: "date-time" },
    timezone: str,
    attendee: { type: "object", properties: { name: str, email: str, phone: nstr } },
    notes: nstr,
    answers: { type: "object", additionalProperties: str },
    location: { type: "object", properties: { type: str, label: str } },
    meetingUrl: nstr,
    manageUrl: str,
    eventType: {
      type: "object",
      nullable: true,
      properties: { id: str, slug: str, title: str },
    },
    rescheduledFromId: nstr,
    cancelledBy: nstr,
    cancelReason: nstr,
    createdAt: { type: "string", format: "date-time" },
  },
};
const slot = {
  type: "object",
  properties: {
    date: { type: "string", description: "YYYY-MM-DD in the requested timezone" },
    slots: {
      type: "array",
      description: "Start times (ISO 8601, UTC). Each slot lasts the event type's duration.",
      items: { type: "string", format: "date-time" },
    },
  },
};
const err = {
  type: "object",
  properties: { error: { type: "object", properties: { code: str, message: str } } },
};
const ok = (schema: unknown, description = "OK") => ({
  [200]: {
    description,
    content: { "application/json": { schema: { type: "object", properties: { data: schema } } } },
  },
});
const errors = {
  400: { description: "Bad request", content: { "application/json": { schema: err } } },
  401: { description: "Missing key", content: { "application/json": { schema: err } } },
  403: { description: "Missing scope", content: { "application/json": { schema: err } } },
  404: { description: "Not found", content: { "application/json": { schema: err } } },
  409: { description: "Slot unavailable", content: { "application/json": { schema: err } } },
  429: { description: "Rate limited", content: { "application/json": { schema: err } } },
};
const q = (name: string, description: string, required = false, schema: unknown = str) => ({
  name,
  in: "query",
  required,
  description,
  schema,
});
const p = (name: string) => ({ name, in: "path", required: true, schema: str });

export function GET() {
  const base = loadEnv().APP_URL.replace(/\/$/, "");
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Bookly API",
      version: "1.0.0",
      description:
        "Read booking pages and availability, and create or manage bookings for one Bookly workspace. Public endpoints need no key (60 req/min per IP); keyed endpoints use `Authorization: Bearer bk_…` (600 req/min). Webhooks: booking.created, booking.confirmed, booking.cancelled, booking.rescheduled, signed with `X-Bookly-Signature: t=<unix>,v1=<hex>` (HMAC-SHA256 of `<t>.<raw body>`).",
    },
    servers: [{ url: `${base}/api/v1` }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer" } },
      schemas: { EventType: eventType, Booking: booking, DaySlots: slot, Error: err },
    },
    paths: {
      "/workspace": {
        get: {
          summary: "Workspace and its booking pages",
          responses: ok({
            type: "object",
            properties: {
              name: str,
              description: nstr,
              timezone: str,
              url: str,
              hosts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    username: str,
                    name: str,
                    bio: nstr,
                    avatarUrl: nstr,
                    timezone: str,
                    url: str,
                  },
                },
              },
            },
          }),
        },
      },
      "/event-types": {
        get: {
          summary: "Bookable event types",
          parameters: [q("username", "Limit to one host")],
          responses: {
            ...ok({ type: "array", items: { $ref: "#/components/schemas/EventType" } }),
            404: errors[404],
          },
        },
      },
      "/event-types/{username}/{slug}": {
        get: {
          summary: "One event type",
          parameters: [p("username"), p("slug")],
          responses: { ...ok({ $ref: "#/components/schemas/EventType" }), 404: errors[404] },
        },
      },
      "/availability": {
        get: {
          summary: "Free start times for an event type",
          parameters: [
            q("username", "Host username", true),
            q("event", "Event type slug", true),
            q("timezone", "IANA timezone for grouping and labels (default UTC)"),
            q("from", "YYYY-MM-DD (default today)"),
            q("to", "YYYY-MM-DD (default from + 13 days, max 62 days)"),
          ],
          responses: {
            ...ok({ type: "array", items: { $ref: "#/components/schemas/DaySlots" } }),
            400: errors[400],
            404: errors[404],
          },
        },
      },
      "/bookings": {
        get: {
          summary: "List bookings",
          security: [{ apiKey: [] }],
          description: "Scope `bookings:read`.",
          parameters: [
            q("username", "Limit to one host"),
            q("upcoming", "1 = upcoming only, 0 = past only"),
            q("status", "pending | confirmed | cancelled | rescheduled | completed | no_show"),
            q("limit", "Max rows (default 100, max 500)", false, { type: "integer" }),
          ],
          responses: {
            ...ok({ type: "array", items: { $ref: "#/components/schemas/Booking" } }),
            401: errors[401],
            403: errors[403],
          },
        },
        post: {
          summary: "Create a booking",
          security: [{ apiKey: [] }],
          description:
            "Scope `bookings:write`. Same rules as the public page: the slot must be free, required questions answered. Emails and calendar events are sent as usual.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "event", "start", "timezone", "name", "email"],
                  properties: {
                    username: str,
                    event: str,
                    start: { type: "string", format: "date-time" },
                    timezone: str,
                    name: str,
                    email: str,
                    phone: str,
                    notes: str,
                    answers: {
                      type: "object",
                      additionalProperties: str,
                      description: "Keyed by question id (or label)",
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { $ref: "#/components/schemas/Booking" } },
                  },
                },
              },
            },
            ...errors,
          },
        },
      },
      "/bookings/{id}": {
        get: {
          summary: "One booking",
          security: [{ apiKey: [] }],
          parameters: [p("id")],
          responses: { ...ok({ $ref: "#/components/schemas/Booking" }), 404: errors[404] },
        },
      },
      "/bookings/{id}/cancel": {
        post: {
          summary: "Cancel a booking",
          security: [{ apiKey: [] }],
          description: "Scope `bookings:write`.",
          parameters: [p("id")],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { reason: str, by: { type: "string", enum: ["host", "attendee"] } },
                },
              },
            },
          },
          responses: { ...ok({ $ref: "#/components/schemas/Booking" }), 404: errors[404] },
        },
      },
      "/bookings/{id}/reschedule": {
        post: {
          summary: "Reschedule a booking",
          security: [{ apiKey: [] }],
          description:
            "Scope `bookings:write`. Creates a replacement booking (returned) and marks the old one rescheduled.",
          parameters: [p("id")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["start"],
                  properties: { start: { type: "string", format: "date-time" }, timezone: str },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { $ref: "#/components/schemas/Booking" } },
                  },
                },
              },
            },
            ...errors,
          },
        },
      },
    },
  };
  return Response.json(spec, { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}
