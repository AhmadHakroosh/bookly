import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbLd, JsonLd } from "../json-ld";
import { Prose } from "../prose";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "What Bookly collects from hosts and guests, why, which sub-processors see it, how long it is kept, and how to export or delete your data. Plain language first.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <Prose
      title="Privacy policy"
      lede="Plain language first, the formal parts after. If anything here is unclear, ask us."
      updated={SITE.legalUpdated}
    >
      <JsonLd data={breadcrumbLd([["Privacy policy", "/privacy"]])} />
      <h2>Who we are</h2>
      <p>
        The hosted Bookly service (“Bookly”, “we”) is operated by {SITE.operator}
        {SITE.operatorAddress ? `, ${SITE.operatorAddress}` : ""}. You can reach us at{" "}
        <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>. This policy covers the
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
          If the host enabled it and you agreed, a transcript of the call on Bookly video, with
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
        email, SMS and WhatsApp delivery providers, Daily.co for Bookly video and transcription,
        Recall.ai for the notetaker that transcribes Google Meet, Teams and Zoom calls, Stripe for
        payments, Anthropic for AI features, and Sentry for error reports (with guest emails and
        phone numbers removed before anything is sent). Each is bound by a data-processing
        agreement; the full list with locations and purposes is in our{" "}
        <Link href="/dpa">data processing agreement</Link>. Data you choose to sync to Google,
        Microsoft, Zoom, HubSpot or Pipedrive is governed by their policies. We do not sell personal
        data and do not share it for advertising.
      </p>
      <p>
        <strong>Calendar and conferencing accounts you connect.</strong> When a host connects
        Google, Microsoft or Zoom, Bookly asks only for the access it needs: to read free/busy time
        on the calendars the host ticks, to add, update and remove the calendar events and meeting
        links for bookings, and the account&apos;s email address to label the connection. Bookly
        stores the access tokens encrypted, keeps a cached view of busy times for one minute, and
        never reads the contents of other events, contacts or mail. The host can disconnect an
        account at any time from Admin → Calendars or Conferencing, which deletes the tokens;
        revoking access at the provider has the same effect. Bookly&apos;s use of information
        received from Google APIs adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
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
      <p>
        <strong>Recording and transcription.</strong> When a host turns on transcription for a call,
        you are told on the booking page (or asked to agree there), in the confirmation email and in
        the call itself. Transcripts are kept for the period the host sets, and you can delete yours
        from your booking page at any time. Meeting notes and recaps are generated with AI from the
        transcript and are marked as such wherever they are shown.
      </p>
      <p>
        <strong>Emails from hosts.</strong> Proposals, payment requests and follow-ups from a host
        carry an unsubscribe link; using it stops those emails from that host. Booking confirmations
        and reminders are part of the booking you made and continue.
      </p>
      <p>
        <strong>California and other US state laws.</strong> You have the right to know what we hold
        about you, to delete it, to correct it, and not to be discriminated against for exercising
        those rights. We do not sell or share personal information as those laws define it, so there
        is nothing to opt out of. Requests go to{" "}
        <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>; we answer within 45 days.
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
        Accounts are for adults (18 or older). Booking pages are not directed at children and we do
        not knowingly collect data from anyone under 13, or under 16 where local law sets that age;
        tell us if you believe we have and we will delete it.
      </p>
      <h2>Changes</h2>
      <p>
        We will post changes here and, for material changes, email hosts at least 14 days before
        they take effect. The date at the top shows the current version.
      </p>
    </Prose>
  );
}
