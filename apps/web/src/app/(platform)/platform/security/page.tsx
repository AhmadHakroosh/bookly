import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "../prose";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Security",
  description:
    "How Bookly protects your data: encryption, authentication, transcripts and consent, infrastructure, and how to report a vulnerability.",
  path: "/security",
});

export default function SecurityPage() {
  return (
    <Prose
      title="Security"
      lede="Client conversations are the most sensitive data a small business holds. Here is how Bookly treats them."
      updated={SITE.legalUpdated}
    >
      <h2>Open source</h2>
      <p>
        Every line that handles your data is public on{" "}
        <a href={SITE.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        . You can audit it, run it yourself, and see exactly what the hosted service does because it
        runs the same code.
      </p>
      <h2>In transit and at rest</h2>
      <ul>
        <li>
          All traffic is served over HTTPS with HSTS. Custom domains get certificates automatically.
        </li>
        <li>
          Data is stored in PostgreSQL with encryption at rest at the hosting provider. Backups are
          taken daily and kept for 30 days.
        </li>
        <li>
          Integration tokens (Google, Microsoft, Zoom, Stripe, HubSpot, Pipedrive) are stored
          encrypted and scoped to the minimum permissions each integration needs.
        </li>
      </ul>
      <h2>Authentication and access</h2>
      <ul>
        <li>
          Passwords are hashed with scrypt. Magic links and password resets expire and are single
          use. Sign-in is rate limited.
        </li>
        <li>Workspace members have roles; API keys are scoped and can be revoked at any time.</li>
        <li>
          Operator access to the hosted service is limited to named staff, and every operator action
          is written to an audit log.
        </li>
      </ul>
      <h2>Transcripts and consent</h2>
      <ul>
        <li>
          Auto-capture is off by default. Hosts turn it on per event type as “ask” (guest chooses at
          booking) or “always” (stated on the booking page and in the call).
        </li>
        <li>A notice is shown in the call for the whole duration whenever transcription is on.</li>
        <li>
          Transcripts expire on the retention period the workspace sets, and any attendee can delete
          their transcript from the meeting page.
        </li>
        <li>
          AI features send transcript text to the model provider (Anthropic) for processing only; it
          is not used to train models. Self-hosters choose their own provider or none.
        </li>
      </ul>
      <h2>Application hardening</h2>
      <ul>
        <li>
          Content Security Policy, frame protection for the admin, strict referrer and permissions
          policies on every response, checked by the automated test suite.
        </li>
        <li>
          Signed webhooks in both directions; inbound signatures are verified before any work.
        </li>
        <li>
          Public booking forms are throttled and quota-limited to keep pages usable under abuse.
        </li>
        <li>Dependencies are audited in CI on every change.</li>
      </ul>
      <h2>Your rights</h2>
      <p>
        Export your workspace data or delete your account and workspace from the settings at any
        time. See the <Link href="/privacy">privacy policy</Link> for details on what is stored and
        for how long.
      </p>
      <h2>Reporting a vulnerability</h2>
      <p>
        Email{" "}
        <a href={`mailto:${SITE.supportEmail}?subject=Security%20disclosure`}>
          {SITE.supportEmail}
        </a>{" "}
        with the details. Please do not open a public issue. We acknowledge reports within two
        business days, keep you informed while we fix the issue, and credit you in the changelog if
        you wish.
      </p>
    </Prose>
  );
}
