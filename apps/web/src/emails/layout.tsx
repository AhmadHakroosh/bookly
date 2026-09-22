import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

/** What every email needs to look like it came from this workspace. */
export type EmailBrand = {
  /** Workspace (or platform) name shown in the header. */
  name: string;
  /** Absolute URL of a square logo; falls back to the Bookly mark. */
  logoUrl: string;
  /** Accent colour for buttons and the header rule. */
  accent: string;
  baseUrl: string;
  /** "Powered by Bookly" in the footer (off for plans that remove branding). */
  poweredBy: boolean;
};

export const BOOKLY_ACCENT = "#e8965a";

const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const styles = {
  body: { margin: 0, backgroundColor: "#f4f4f5", fontFamily: font, color: "#18181b" },
  container: {
    maxWidth: "560px",
    margin: "0 auto",
    padding: "32px 16px 40px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #e4e4e7",
    padding: "32px 32px 28px",
  },
  h1: { margin: "0 0 12px", fontSize: "22px", lineHeight: "30px", fontWeight: 600 },
  p: { margin: "0 0 14px", fontSize: "15px", lineHeight: "24px", color: "#27272a" },
  muted: { margin: "0", fontSize: "13px", lineHeight: "20px", color: "#71717a" },
  label: {
    margin: 0,
    fontSize: "12px",
    lineHeight: "18px",
    color: "#71717a",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  value: { margin: 0, fontSize: "15px", lineHeight: "22px", color: "#18181b" },
  hr: { borderColor: "#e4e4e7", margin: "20px 0" },
};

export function EmailLayout({
  brand,
  preview,
  title,
  children,
  footer,
}: {
  brand: EmailBrand;
  preview: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={{ padding: "0 4px 16px" }}>
            <Row>
              <Column style={{ width: "36px", verticalAlign: "middle" }}>
                <Img
                  src={brand.logoUrl}
                  alt=""
                  width="28"
                  height="28"
                  style={{ borderRadius: "7px", display: "block" }}
                />
              </Column>
              <Column style={{ verticalAlign: "middle" }}>
                <Text style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#18181b" }}>
                  {brand.name}
                </Text>
              </Column>
            </Row>
          </Section>
          <Section style={styles.card}>
            <div
              style={{
                height: "4px",
                width: "48px",
                borderRadius: "2px",
                backgroundColor: brand.accent,
                marginBottom: "20px",
              }}
            />
            <Heading as="h1" style={styles.h1}>
              {title}
            </Heading>
            {children}
          </Section>
          <Section style={{ padding: "20px 4px 0" }}>
            {footer}
            {brand.poweredBy && (
              <Text style={{ ...styles.muted, marginTop: "6px" }}>
                Scheduling by{" "}
                <Link href="https://github.com/AhmadHakroosh/bookly" style={{ color: "#71717a" }}>
                  Bookly
                </Link>
                , open source.
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Paragraphs from plain text: blank lines split paragraphs, single newlines break lines. */
export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <Text key={i} style={styles.p}>
            {p.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </Text>
        ))}
    </>
  );
}

export function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Section
      style={{
        backgroundColor: "#fafafa",
        borderRadius: "12px",
        padding: "14px 16px",
        margin: "6px 0 18px",
      }}
    >
      {rows.map(([label, value], i) => (
        <Row key={label} style={{ marginTop: i ? "10px" : 0 }}>
          <Column style={{ width: "96px", verticalAlign: "top" }}>
            <Text style={styles.label}>{label}</Text>
          </Column>
          <Column style={{ verticalAlign: "top" }}>
            <Text style={styles.value}>{value}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}

export function Cta({ href, label, accent }: { href: string; label: string; accent: string }) {
  return (
    <Button
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: "#18181b",
        color: "#ffffff",
        fontSize: "14px",
        fontWeight: 600,
        padding: "11px 18px",
        borderRadius: "10px",
        textDecoration: "none",
        borderBottom: `3px solid ${accent}`,
      }}
    >
      {label}
    </Button>
  );
}
