import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbLd, JsonLd } from "../json-ld";
import { Prose } from "../prose";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Terms of service",
  description:
    "The agreement for the hosted Bookly service: your account, acceptable use, your content and guests, billing and cancellation, AI features, liability, changes.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <Prose
      title="Terms of service"
      lede="These terms apply to the hosted Bookly service. The open-source software is licensed separately under the AGPL-3.0."
      updated={SITE.legalUpdated}
    >
      <JsonLd data={breadcrumbLd([["Terms of service", "/terms"]])} />
      <h2>1. The agreement</h2>
      <p>
        By creating a workspace you agree to these terms on behalf of yourself or the organisation
        you represent. The service is provided by {SITE.operator} (“Bookly”, “we”). If you do not
        agree, do not use the hosted service; you may still self-host the software under its
        license.
      </p>
      <h2>2. Your account</h2>
      <p>
        You are responsible for your credentials and for what happens in your workspace. Keep your
        password private and tell us at once if you suspect unauthorised access. You must be at
        least 16, or the age of majority where you live, to create an account.
      </p>
      <h2>3. Acceptable use</h2>
      <p>You agree not to use Bookly to:</p>
      <ul>
        <li>
          Record or transcribe people without the consent the law and the in-product notices
          require.
        </li>
        <li>
          Send unsolicited bulk messages, or messages that are unlawful, deceptive or abusive.
        </li>
        <li>Collect data you have no right to collect, or breach the privacy of guests.</li>
        <li>Probe, overload or interfere with the service, or bypass plan limits.</li>
        <li>Resell the service without an agreement with us.</li>
      </ul>
      <p>
        We may suspend a workspace that breaches these rules. Where practical we will warn you first
        and give you a chance to fix it.
      </p>
      <h2>4. Your content and your guests</h2>
      <p>
        Everything you and your guests put into Bookly stays yours. You grant us only the rights
        needed to run the service: to store it, process it, and send it to the integrations and
        sub-processors you use. You are the controller of your guests&apos; data and must have a
        lawful basis to collect it; our <Link href="/privacy">privacy policy</Link> describes how we
        process it on your behalf and stands as the data-processing agreement between us.
      </p>
      <h2>5. Plans, billing and cancellation</h2>
      <ul>
        <li>
          The Free plan is free. Paid plans are billed in advance through Stripe, monthly or yearly
          as you choose at checkout.
        </li>
        <li>
          You can upgrade, downgrade or cancel at any time from the billing page. Upgrades apply
          immediately; downgrades and cancellations take effect at the end of the current billing
          period, which for yearly plans is the end of the year you paid for. We do not refund
          partial periods unless the law requires it.
        </li>
        <li>
          We may change prices with at least 30 days&apos; notice by email. Continued use after that
          date means you accept the new price.
        </li>
        <li>Taxes are your responsibility unless we are required to collect them.</li>
      </ul>
      <h2>6. Payments you take through Bookly</h2>
      <p>
        Paid bookings are processed by Stripe under your own Stripe account and Stripe&apos;s terms.
        Bookly does not hold your funds, and refunds and disputes are between you and your guests.
      </p>
      <h2>7. AI features</h2>
      <p>
        Briefings, recaps, action items and drafted emails are generated automatically and can be
        wrong. Review them before you rely on or send them. You remain responsible for anything you
        send to a guest.
      </p>
      <h2>8. Availability and support</h2>
      <p>
        We aim for the service to be available continuously but do not guarantee it. We may change
        or retire features with reasonable notice. Support is by email during business days.
      </p>
      <h2>9. Termination and data</h2>
      <p>
        You can delete your workspace at any time and export your data before you do. We may
        terminate accounts that breach these terms or that have been inactive on the Free plan for
        more than 12 months, after emailing you. After deletion, data is removed from backups within
        30 days.
      </p>
      <h2>10. Warranties and liability</h2>
      <p>
        The service is provided “as is”. To the extent the law allows, we exclude all implied
        warranties and our total liability to you for any claim is limited to the amount you paid us
        in the 12 months before the claim. We are not liable for indirect or consequential loss, or
        for loss caused by integrations, guests or third parties. Nothing here limits liability that
        cannot be limited by law.
      </p>
      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms. Material changes will be emailed to workspace owners at least 14
        days before they take effect. The date at the top shows the current version.
      </p>
      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws of the operator&apos;s place of business, and disputes
        will be resolved in its courts, unless consumer-protection law where you live gives you
        additional rights.
      </p>
      <h2>13. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
        .
      </p>
    </Prose>
  );
}
