import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "../prose";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description: "What Bookly collects, why, how long it is kept, and the rights you have over it.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <Prose
      title="Privacy policy"
      lede="Plain language first, the formal parts after. If anything here is unclear, ask us."
      updated={SITE.legalUpdated}
    >
      <h2>Who we are</h2>
      <p>
        The hosted Bookly service (“Bookly”, “we”) is operated by {SITE.operator}. You can reach us
        at <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>. This policy covers the
        hosted service only. If you self-host Bookly, you are the operator and this policy does not
        apply to your installation.
      </p>
      <h2>Two kinds of people</h2>
      <p>
        <strong>Hosts</strong> create a workspace and use Bookly to take bookings.{" "}
        <strong>Guests</strong> book time with a host. For guest data, the host is the controller
        and Bookly processes it on the host&apos;s behalf; for host account data, Bookly is the
        controller.
      </p>
      <h2>What we collect</h2>
      <h3>From hosts</h3>
      <ul>
        <li>Account details: name, email, password hash, profile photo and timezone.</li>
        <li>Workspace content: event types, availability, contacts, notes, tasks and settings.</li>
        <li>
          Integration data you connect: calendar events (to detect conflicts and create events),
          conferencing links, CRM records you choose to sync, payment status from Stripe. We store
          the tokens needed for these connections, encrypted.
        </li>
        <li>
          Billing: plan, invoices and payment status. Card details are held by Stripe, not us.
        </li>
        <li>
          Usage and logs: pages visited within the app, API requests, errors, and IP addresses in
          server logs for security and abuse prevention.
        </li>
      </ul>
      <h3>From guests</h3>
      <ul>
        <li>
          What you enter when booking: name, email, phone if asked, answers to the host&apos;s
          questions, timezone, and the time you booked.
        </li>
        <li>
          If the host enabled it and you agreed, a transcript of the call on built-in video, with
          speaker labels and any recap generated from it.
        </li>
        <li>
          Emails, texts or WhatsApp messages sent to you about the booking, and their delivery
          status.
        </li>
      </ul>
      <h2>Why we use it</h2>
      <ul>
        <li>
          To run the service: show availability, create bookings, send confirmations and reminders.
        </li>
        <li>
          To provide the meeting features hosts turn on: briefings, transcripts, recaps, tasks and
          follow-ups.
        </li>
        <li>To bill hosts, prevent abuse, keep the service secure and fix bugs.</li>
        <li>To answer support requests.</li>
      </ul>
      <p>
        We do not sell personal data, show advertising, or use your content to train AI models. AI
        features send the relevant text (a contact&apos;s timeline, a transcript) to Anthropic to
        generate a briefing or recap; Anthropic processes it under their commercial terms and does
        not train on it.
      </p>
      <h2>Who else sees it</h2>
      <p>
        Sub-processors that host or deliver the service: the hosting and database providers, the
        email, SMS and WhatsApp delivery providers, Daily.co for built-in video and transcription,
        Stripe for payments, Anthropic for AI features, and Sentry for error reports. Each is bound
        by a data-processing agreement. The current list is available on request. Data you choose to
        sync to Google, Microsoft, Zoom, HubSpot or Pipedrive is governed by their policies.
      </p>
      <h2>How long we keep it</h2>
      <ul>
        <li>
          Account and workspace data: until you delete the workspace, then 30 days in backups.
        </li>
        <li>
          Transcripts and recaps: until the retention period the host set (default 90 days), or
          until an attendee deletes them, whichever is sooner.
        </li>
        <li>Server logs: 30 days. Billing records: as long as tax law requires.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You can access, correct, export or delete your data. Hosts do this from workspace settings.
        Guests can manage or cancel a booking from the link in their confirmation email, delete
        their transcript from the meeting page, and can email us for anything else. Where GDPR or
        similar laws apply, you also have the right to object, restrict processing, and complain to
        your supervisory authority. Guests should contact the host first, as the host controls their
        booking data; we will help either way.
      </p>
      <h2>Cookies</h2>
      <p>
        We use a session cookie to keep you signed in and a preference cookie for your theme. No
        advertising or cross-site tracking cookies. Embedded booking widgets set no cookies on the
        embedding site.
      </p>
      <h2>International transfers</h2>
      <p>
        Data is stored in the region shown on the <Link href="/security">security page</Link>. Where
        data leaves that region for a sub-processor, we rely on standard contractual clauses or an
        adequacy decision.
      </p>
      <h2>Children</h2>
      <p>
        The hosted service is not directed at children under 16 and we do not knowingly collect
        their data.
      </p>
      <h2>Changes</h2>
      <p>
        We will post changes here and, for material changes, email hosts at least 14 days before
        they take effect. The date at the top shows the current version.
      </p>
    </Prose>
  );
}
