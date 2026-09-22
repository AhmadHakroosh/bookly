import { Link, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { Cta, Details, EmailLayout, Paragraphs, styles, type EmailBrand } from "./layout";

type DetailRow = [string, ReactNode];

/** Confirmation, reminder or cancellation for the guest: intro from the template, then details. */
export function BookingEmail({
  brand,
  title,
  preview,
  body,
  rows,
  cta,
  note,
  signedBy,
}: {
  brand: EmailBrand;
  title: string;
  preview: string;
  body: string;
  rows: DetailRow[];
  cta?: { href: string; label: string };
  note?: string;
  signedBy?: string;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={preview}
      title={title}
      footer={
        signedBy ? (
          <Text style={styles.muted}>
            Sent by {signedBy} via {brand.name}. Reply to this email to reach them directly.
          </Text>
        ) : undefined
      }
    >
      <Paragraphs text={body} />
      <Details rows={rows} />
      {cta && <Cta href={cta.href} label={cta.label} accent={brand.accent} />}
      {note && <Text style={{ ...styles.muted, marginTop: "18px" }}>{note}</Text>}
    </EmailLayout>
  );
}

/** Host-side notification: who booked, the answers, a button into the admin. */
export function HostEmail({
  brand,
  title,
  preview,
  intro,
  rows,
  cta,
  extra,
}: {
  brand: EmailBrand;
  title: string;
  preview: string;
  intro: string;
  rows: DetailRow[];
  cta?: { href: string; label: string };
  extra?: ReactNode;
}) {
  return (
    <EmailLayout brand={brand} preview={preview} title={title}>
      <Text style={styles.p}>{intro}</Text>
      <Details rows={rows} />
      {extra}
      {cta && <Cta href={cta.href} label={cta.label} accent={brand.accent} />}
    </EmailLayout>
  );
}

/** A letter from the host: follow-ups, proposals, payment requests, client recaps. */
export function LetterEmail({
  brand,
  preview,
  title,
  body,
  cta,
  signedBy,
}: {
  brand: EmailBrand;
  preview: string;
  title?: string;
  body: string;
  cta?: { href: string; label: string };
  signedBy: string;
}) {
  return (
    <EmailLayout
      brand={brand}
      preview={preview}
      title={title ?? `A note from ${signedBy}`}
      footer={
        <Text style={styles.muted}>
          Sent by {signedBy} via {brand.name}. Reply to this email to answer them directly.
        </Text>
      }
    >
      <Paragraphs text={body} />
      {cta && <Cta href={cta.href} label={cta.label} accent={brand.accent} />}
    </EmailLayout>
  );
}

/** Sign-in links, password resets, invitations. */
export function AccountEmail({
  brand,
  title,
  preview,
  body,
  cta,
  note,
}: {
  brand: EmailBrand;
  title: string;
  preview: string;
  body: string;
  cta: { href: string; label: string };
  note?: string;
}) {
  return (
    <EmailLayout brand={brand} preview={preview} title={title}>
      <Paragraphs text={body} />
      <Cta href={cta.href} label={cta.label} accent={brand.accent} />
      <Text style={{ ...styles.muted, marginTop: "18px" }}>
        Or paste this link into your browser:{" "}
        <Link href={cta.href} style={{ color: "#71717a" }}>
          {cta.href}
        </Link>
      </Text>
      {note && <Text style={styles.muted}>{note}</Text>}
    </EmailLayout>
  );
}
