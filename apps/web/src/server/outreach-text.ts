/** Email templates for the contact page, with placeholder filling. Pure. */
export type Template = { subject: string; body: string };

export const DEFAULT_TEMPLATES: { proposal: Template; paymentRequest: Template } = {
  proposal: {
    subject: "Proposal for {company}",
    body: "Hi {name},\n\nThanks for the conversation. As discussed, here is my proposal:\n\n[scope, timeline, price]\n\nHappy to adjust anything — just reply to this email.\n\n{host}",
  },
  paymentRequest: {
    subject: "Invoice: {amount}",
    body: "Hi {name},\n\nHere is the payment request for {amount}. You can pay securely here:\n{payLink}\n\nThank you,\n{host}",
  },
};

export function fillTemplate(t: Template, vars: Record<string, string>): Template {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
  return { subject: fill(t.subject).trim(), body: fill(t.body).trim() };
}
