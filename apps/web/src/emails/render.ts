import { render } from "@react-email/components";
import type { ReactElement } from "react";

/** HTML plus a plain-text alternative from the same React tree. */
export async function renderEmail(el: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { html, text };
}
