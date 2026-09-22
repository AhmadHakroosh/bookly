import { brandFor } from "./brand";
import { renderEmail } from "./render";
import { AccountEmail } from "./templates";
import type { Mail } from "./booking";

/** Sign-in links, password resets and invitations, in the platform's look. */
export async function accountMail(input: {
  subject: string;
  title: string;
  body: string;
  cta: { href: string; label: string };
  note?: string;
}): Promise<Mail> {
  const { html, text } = await renderEmail(
    <AccountEmail
      brand={brandFor(null)}
      title={input.title}
      preview={input.subject}
      body={input.body}
      cta={input.cta}
      note={input.note}
    />,
  );
  return { subject: input.subject, text, html };
}
