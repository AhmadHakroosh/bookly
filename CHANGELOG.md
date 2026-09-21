# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Group sessions: `seats` per event type; a slot stays bookable until full, attendees share one meeting link, seats left shown on the booking page and in the API.
- Recurring bookings: event types can repeat daily, weekly or monthly for 2–52 sessions; one booking reserves the series, with per-session manage links and "cancel remaining" (migration 0007).

## [0.1.0] - 2026-09-21

First public release.

### Added

- Booking pages per host with weekly hours, date overrides, buffers, notice and horizon rules, timezone-aware for visitors
- Google Calendar and Outlook sync for conflicts and events; meeting links on Google Meet, Zoom, Microsoft Teams or built-in video (Daily.co)
- Paid bookings via Stripe Checkout with refunds on cancel
- Email, SMS and WhatsApp reminders, follow-up emails, no-show tracking, host pings on Slack / text when someone books or joins
- Teams: invitations and roles, round-robin and collective event types
- Public REST API with scoped keys, signed webhooks, embeddable widget, custom domains with automatic HTTPS
- Cloud (multi-tenant) mode with Free, Pro and Team plans, billing and an operator console (`packages/cloud`, proprietary).
- Docker Compose self-hosting with optional Caddy HTTPS; Vercel deployment path.
- Documentation in `docs/`.
