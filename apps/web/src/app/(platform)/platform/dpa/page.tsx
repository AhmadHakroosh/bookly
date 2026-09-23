import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbLd, JsonLd } from "../json-ld";
import { Prose } from "../prose";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Data processing agreement",
  description:
    "How Bookly processes guest data on behalf of hosts: roles, instructions, sub-processors with locations, security, transfers, breach notice, deletion and audits.",
  path: "/dpa",
});

const SUBPROCESSORS: [name: string, purpose: string, location: string][] = [
  ["Vercel", "Application hosting and edge network", "United States (global edge)"],
  ["Neon", "PostgreSQL database and backups", "United States"],
  ["Upstash", "Job queue, rate limiting", "United States"],
  ["Resend", "Transactional and host email delivery", "United States"],
  ["Daily.co", "Bookly video calls and their transcription", "United States"],
  ["Recall.ai", "Notetaker for Google Meet, Teams and Zoom calls", "United States"],
  ["Stripe", "Subscriptions, paid bookings, payouts to hosts", "United States"],
  ["Anthropic", "AI briefings, recaps and drafts (no training on your data)", "United States"],
  ["Sentry", "Error reports (guest emails and phone numbers removed first)", "United States"],
];

export default function DpaPage() {
  return (
    <Prose
      title="Data processing agreement"
      lede="This agreement applies whenever Bookly processes personal data of your guests and contacts on your behalf. It forms part of the terms of service; no signature is needed. A signed copy is available on request."
      updated={SITE.legalUpdated}
    >
      <JsonLd data={breadcrumbLd([["Data processing agreement", "/dpa"]])} />
      <h2>1. Parties and roles</h2>
      <p>
        The <strong>customer</strong> is the person or organisation that owns a workspace. The{" "}
        <strong>processor</strong> is {SITE.operator}
        {SITE.operatorAddress ? `, ${SITE.operatorAddress}` : ""} (“Bookly”). For the personal data
        of guests, contacts and meeting participants that the customer puts into Bookly or that
        arrives through bookings, the customer is the controller and Bookly the processor. For the
        customer&apos;s own account data Bookly is the controller, as described in the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>
      <h2>2. What is processed</h2>
      <p>
        Names, email addresses, phone numbers, company names, booking details, answers to booking
        questions, notes the customer writes, meeting transcripts and recaps where the customer has
        turned transcription on, payment status, and the metadata that goes with all of it. Data
        subjects are the customer&apos;s guests, contacts and anyone else on a transcribed call.
        Processing lasts as long as the workspace exists and up to 30 days afterwards for backups.
      </p>
      <h2>3. Instructions</h2>
      <p>
        Bookly processes this data only to provide the service as documented, on the customer&apos;s
        instructions given through the product (creating event types, turning on integrations,
        sending emails, and so on), and as the law requires. Bookly will tell the customer if an
        instruction appears to break data-protection law.
      </p>
      <h2>4. Confidentiality and staff</h2>
      <p>
        Only named staff with a need can access customer data, under a duty of confidentiality, and
        every operator action on the hosted service is written to an audit log.
      </p>
      <h2>5. Security</h2>
      <p>
        The measures on the <Link href="/security">security page</Link> apply: encryption in transit
        and at rest, encrypted integration tokens, scoped API keys, rate limiting, signed webhooks,
        daily backups kept for 30 days, and dependency audits in CI. The software is open source, so
        the customer can inspect exactly how data is handled.
      </p>
      <h2>6. Sub-processors</h2>
      <p>
        The customer authorises the sub-processors below. Each is bound by a written agreement with
        obligations no weaker than this one. Bookly will publish changes to this list here at least
        14 days before a new sub-processor handles customer data and email workspace owners; a
        customer who objects on reasonable grounds can end the service and export their data before
        the change.
      </p>
      <table>
        <thead>
          <tr>
            <th>Sub-processor</th>
            <th>Purpose</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map(([name, purpose, location]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{purpose}</td>
              <td>{location}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Integrations the customer connects (Google, Microsoft, Zoom, HubSpot, Pipedrive) receive
        data under the customer&apos;s own agreements with those providers and are not
        sub-processors of Bookly.
      </p>
      <h2>7. International transfers</h2>
      <p>
        Data is processed in the United States. For data subjects in the EU, UK or Switzerland,
        transfers rely on the EU Standard Contractual Clauses (module two, controller to processor)
        and the UK addendum, which are incorporated here by reference, or on an adequacy decision
        such as the EU-US Data Privacy Framework where a sub-processor is certified under it.
      </p>
      <h2>8. Helping the customer</h2>
      <p>
        Bookly helps the customer answer data-subject requests: workspace export and deletion,
        per-contact editing and deletion, and transcript deletion are in the product, and guests can
        cancel bookings, unsubscribe from a host&apos;s emails and delete their transcript
        themselves. Requests that reach Bookly directly are forwarded to the customer without undue
        delay. Bookly will also help with data-protection impact assessments and consultations with
        a supervisory authority where the customer needs it.
      </p>
      <h2>9. Personal-data breaches</h2>
      <p>
        Bookly will notify the customer without undue delay, and at most 72 hours after becoming
        aware of a breach affecting their data, by email to the workspace owners, with what is known
        about the nature of the breach, the data and people affected, the likely consequences and
        the measures taken.
      </p>
      <h2>10. Deletion and return</h2>
      <p>
        The customer can export all workspace data at any time and delete the workspace from
        settings. On deletion Bookly removes the data and, within 30 days, the copies in backups,
        unless the law requires keeping some of it (billing records, for example).
      </p>
      <h2>11. Audit</h2>
      <p>
        Bookly will provide the information needed to show compliance with this agreement: this
        page, the security page, the public source code, and on request a summary of the
        sub-processors&apos; own certifications. If that is not enough for a lawful audit request,
        the customer may audit once a year, on 30 days&apos; notice, at reasonable times and cost.
      </p>
      <h2>12. Precedence</h2>
      <p>
        If this agreement conflicts with the <Link href="/terms">terms of service</Link>, this
        agreement wins for data-protection matters. Liability is governed by the terms. Questions:{" "}
        <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
      </p>
    </Prose>
  );
}
