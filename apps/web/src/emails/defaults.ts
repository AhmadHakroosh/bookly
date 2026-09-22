/**
 * Default wording for the emails a workspace can customise, and the placeholder filler. Pure.
 * Placeholders: {name} {host} {event} {when} {where} {duration} {bookingUrl} {workspace}
 */
export type EmailTemplate = { subject: string; body: string };
export type EmailTemplateKind = "confirmation" | "reminder" | "cancellation";

export const EMAIL_PLACEHOLDERS = [
  "{name}",
  "{host}",
  "{event}",
  "{when}",
  "{where}",
  "{duration}",
  "{bookingUrl}",
  "{workspace}",
] as const;

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateKind, EmailTemplate> = {
  confirmation: {
    subject: "Confirmed: {event} with {host}",
    body: "Hi {name},\n\nYou're booked with {host}. The details are below, and the calendar invitation is attached.\n\nNeed to change something? Use the link at the bottom of this email.",
  },
  reminder: {
    subject: "Reminder: {event} with {host} {relative}",
    body: "Hi {name},\n\nA quick reminder that {event} with {host} is coming up {relative}.\n\nSee you then.",
  },
  cancellation: {
    subject: "Cancelled: {event} on {when}",
    body: "Hi {name},\n\n{event} with {host} on {when} has been cancelled. If this was a mistake, reply to this email or book a new time.",
  },
};

export type EmailTemplateOverrides = Partial<
  Record<EmailTemplateKind, { subject?: string; body?: string }>
>;

/** The workspace's wording when set, otherwise the default. Blank fields fall back per field. */
export function resolveEmailTemplate(
  kind: EmailTemplateKind,
  overrides: EmailTemplateOverrides | undefined,
): EmailTemplate {
  const d = DEFAULT_EMAIL_TEMPLATES[kind];
  const o = overrides?.[kind];
  return {
    subject: o?.subject?.trim() || d.subject,
    body: o?.body?.trim() || d.body,
  };
}

export function fillEmailTemplate(t: EmailTemplate, vars: Record<string, string>): EmailTemplate {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
  return { subject: fill(t.subject).replace(/\s+/g, " ").trim(), body: fill(t.body).trim() };
}
