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
        you represent. The service is provided by {SITE.operator}
        {SITE.operatorAddress ? `, ${SITE.operatorAddress}` : ""} (“Bookly”, “we”). If you do not
        agree, do not use the hosted service; you may still self-host the software under its
        license.
      </p>
      <h2>2. Your account</h2>
      <p>
        You are responsible for your credentials and for what happens in your workspace. Keep your
        password private and tell us at once if you suspect unauthorised access. You must be at
        least 18, or the age of majority where you live if that is higher, to create an account, and
        you must be using Bookly for work rather than as a consumer.
      </p>
      <h2>3. Acceptable use</h2>
      <p>You agree not to use Bookly to:</p>
      <ul>
        <li>
          Record or transcribe people without the consent the law and the in-product notices require
          (see section 4).
        </li>
        <li>
          Send unsolicited bulk messages, or messages that are unlawful, deceptive or abusive, or
          keep emailing a contact who has unsubscribed.
        </li>
        <li>
          Store health records, protected health information, payment card numbers or other data
          that needs a regime Bookly does not offer (see section 5).
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
        process it, and the <Link href="/dpa">data processing agreement</Link> is part of these
        terms for that processing.
      </p>
      <p>
        <strong>Recording and transcription.</strong> Where you turn on auto-capture, Bookly tells
        guests on the booking page and in the confirmation, and announces itself when the call
        starts. Some places (several US states and most of Europe among them) require the consent of
        everyone on a call, and it is your responsibility to know the rules where you and your
        guests are and to stop the transcription if anyone objects. Bookly&apos;s notices help you
        meet those rules; they do not replace your judgement.
      </p>
      <p>
        <strong>Emails you send to contacts.</strong> Proposals, payment requests and follow-ups go
        out under your name. They carry an unsubscribe link and the postal address you set in
        workspace settings, as commercial-email laws such as CAN-SPAM require; Bookly refuses to
        send to a contact who has unsubscribed. You are the sender for the purposes of those laws.
      </p>
      <h2>5. Regulated data</h2>
      <p>
        The hosted service is not built for data that needs a special legal regime. In particular we
        do not sign business associate agreements under HIPAA, so you must not store protected
        health information in Bookly; do not collect card numbers (payments go through Stripe, which
        never shows them to us); and do not use Bookly with children under 13, or under 16 where
        local law sets that age. If your work needs one of these regimes, self-host Bookly under
        your own agreements or talk to us first.
      </p>
      <h2>6. Plans, billing and cancellation</h2>
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
          The Team plan is priced per member with a minimum of two seats. When a member joins, the
          seat is charged for the rest of the current billing period and in full from the next one.
          When a member is removed, the unused part of that seat is credited against your next
          invoice rather than refunded.
        </li>
        <li>
          We may change prices with at least 30 days&apos; notice by email. Continued use after that
          date means you accept the new price.
        </li>
        <li>
          Prices exclude taxes. Where we are required to collect sales tax or VAT we add it at
          checkout based on the billing address you give; businesses in the EU and UK can enter a
          VAT number to be invoiced under the reverse charge.
        </li>
      </ul>
      <h2>7. Payments you take through Bookly</h2>
      <p>
        Paid bookings and payment requests are processed by Stripe under your own Stripe account and
        Stripe&apos;s terms. Bookly does not hold your funds, and refunds and disputes are between
        you and your guests.
      </p>
      <p>
        Bookly charges a platform fee of <strong>5%</strong> of each payment your guests make
        through Bookly, deducted automatically from the payment before Stripe pays you out.
        Stripe&apos;s own processing fees apply on top. When you refund a payment, the platform fee
        is returned with it. The fee applies to the hosted service only; self-hosted installs pay
        nothing to Bookly. We may change the fee with at least 30 days&apos; notice by email.
      </p>
      <h2>8. AI features</h2>
      <p>
        Briefings, recaps, action items and drafted emails are generated automatically by a language
        model and can be wrong. They are marked as AI-generated in the product. Review them before
        you rely on or send them; anything you forward to a guest goes out under your name and you
        remain responsible for it. AI features send the relevant text to Anthropic for processing
        only; it is not used to train models.
      </p>
      <h2>9. Availability and support</h2>
      <p>
        We aim for the service to be available continuously but do not guarantee it. We may change
        or retire features with reasonable notice. Support is by email during business days.
      </p>
      <h2>10. Termination and data</h2>
      <p>
        You can delete your workspace at any time and export your data before you do. We may
        terminate accounts that breach these terms or that have been inactive on the Free plan for
        more than 12 months, after emailing you. After deletion, data is removed from backups within
        30 days.
      </p>
      <h2>11. Warranties and liability</h2>
      <p>
        The service is provided “as is”. To the extent the law allows, we exclude all implied
        warranties and our total liability to you for any claim is limited to the amount you paid us
        in the 12 months before the claim. We are not liable for indirect or consequential loss, or
        for loss caused by integrations, guests or third parties. Nothing here limits liability that
        cannot be limited by law.
      </p>
      <h2>12. Changes to these terms</h2>
      <p>
        We may update these terms. Material changes will be emailed to workspace owners at least 14
        days before they take effect. The date at the top shows the current version.
      </p>
      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the laws of the United States and of the state in which{" "}
        {SITE.operator} is organised, and disputes will be resolved in the courts there, unless
        mandatory law where you live gives you additional rights.
      </p>
      <h2>14. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
        .
      </p>
    </Prose>
  );
}
