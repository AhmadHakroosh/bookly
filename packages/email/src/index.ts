import { loadEnv } from "@bookly/config";

export type EmailAttachment = { filename: string; content: string | Buffer; contentType?: string };

export type EmailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  from?: string;
  /** Send on someone's behalf: the From line becomes "<name> via <platform>" at the platform address. */
  fromName?: string;
  attachments?: EmailAttachment[];
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
};

/**
 * "Ahmad Hakroosh via Bookly" <noreply@example.com>: a personal sender line on the verified platform
 * address, so SPF/DKIM stay intact while the inbox shows who wrote it.
 */
export function senderFor(name: string, base: string): string {
  // "Name <address>" split on the last "<" (no regex: the name part is free text).
  const b = base.trim();
  const lt = b.lastIndexOf("<");
  const bracketed = lt >= 0 && b.endsWith(">");
  const address = bracketed ? b.slice(lt + 1, -1).trim() : b;
  const platform =
    (bracketed ? b.slice(0, lt).trim().replace(/^"|"$/g, "") : "").trim() || "Bookly";
  const clean = name
    .replace(/[\r\n"<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  if (!clean) return base;
  return `"${clean} via ${platform}" <${address}>`;
}

function resolveFrom(m: EmailMessage, base: string) {
  if (m.from) return m.from;
  return m.fromName ? senderFor(m.fromName, base) : base;
}

export interface EmailDriver {
  send(message: EmailMessage): Promise<{ id?: string }>;
}

/** One line for the log: header fields come from user input and must not fake extra lines. */
const oneLine = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ");

class ConsoleDriver implements EmailDriver {
  async send(m: EmailMessage) {
    const header = [
      `from=${oneLine(resolveFrom(m, loadEnv().EMAIL_FROM))}`,
      `to=${oneLine(m.to)}`,
      `subject="${oneLine(m.subject)}"`,
      m.replyTo ? `reply-to=${oneLine(m.replyTo)}` : "",
      m.attachments?.length
        ? `attachments=${oneLine(m.attachments.map((a) => a.filename).join(","))}`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    // The body is printed indented, so its lines cannot pass for log entries of their own.
    const body = m.text.replace(/\r?\n/g, "\n    ");
    console.log(`\n📧 [email:console] ${header}\n    ${body}\n`);
    return {};
  }
}

class ResendDriver implements EmailDriver {
  constructor(private apiKey: string) {}
  async send(m: EmailMessage) {
    const { Resend } = await import("resend");
    const { data, error } = await new Resend(this.apiKey).emails.send({
      from: resolveFrom(m, loadEnv().EMAIL_FROM),
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      replyTo: m.replyTo,
      headers: m.headers,
      // Base64 strings survive JSON serialisation; Buffers would be sent as {type,data}.
      attachments: m.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
        contentType: a.contentType,
      })),
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return { id: data?.id };
  }
}

class SmtpDriver implements EmailDriver {
  async send(m: EmailMessage) {
    const env = loadEnv();
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ?? false,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    const info = await transport.sendMail({
      from: resolveFrom(m, env.EMAIL_FROM),
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      replyTo: m.replyTo,
      headers: m.headers,
      attachments: m.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { id: info.messageId };
  }
}

let driver: EmailDriver | undefined;

export function getEmail(): EmailDriver {
  if (driver) return driver;
  const env = loadEnv();
  switch (env.EMAIL_DRIVER) {
    case "resend":
      if (!env.RESEND_API_KEY)
        throw new Error("RESEND_API_KEY is required when EMAIL_DRIVER=resend");
      driver = new ResendDriver(env.RESEND_API_KEY);
      break;
    case "smtp":
      if (!env.SMTP_HOST) throw new Error("SMTP_HOST is required when EMAIL_DRIVER=smtp");
      driver = new SmtpDriver();
      break;
    default:
      driver = new ConsoleDriver();
  }
  return driver;
}

export const sendEmail = (m: EmailMessage) => getEmail().send(m);
