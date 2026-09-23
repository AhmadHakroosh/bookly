/** Email templates for the contact page, with placeholder filling. Pure. */
export type Template = { subject: string; body: string };

export type OutreachKind = "proposal" | "paymentRequest" | "checkIn";

export const DEFAULT_TEMPLATES: Record<OutreachKind, Template> = {
  proposal: {
    subject: "Proposal for {company}",
    body: "Hi {name},\n\nThanks for the conversation. As discussed, here is my proposal:\n\n[scope, timeline, price]\n\nHappy to adjust anything — just reply to this email.\n\n{host}",
  },
  paymentRequest: {
    subject: "Invoice: {amount}",
    body: "Hi {name},\n\nHere is the payment request for {amount}. You can pay securely here:\n{payLink}\n\nThank you,\n{host}",
  },
  /** The follow-up nudge sent from a contact page when it is time to check in. */
  checkIn: {
    subject: "Checking in, {name}",
    body: "Hi {name},\n\nI wanted to follow up on our last conversation and see where things stand on your side. Is there anything I can clarify or help with?\n\nIf it makes sense, you can grab a time here: {bookingUrl}\n\nBest,\n{host}",
  },
};

export function fillTemplate(t: Template, vars: Record<string, string>): Template {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
  return { subject: fill(t.subject).trim(), body: fill(t.body).trim() };
}
