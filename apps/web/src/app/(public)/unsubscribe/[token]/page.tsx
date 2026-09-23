import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicContainer, PublicSkeleton } from "../../container";
import { getContactById } from "@/server/contacts";
import { readUnsubscribeToken } from "@/server/unsubscribe";
import { UnsubscribeForm } from "./form";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/**
 * The link in the footer of outreach emails. A GET only shows the state and a button (link
 * scanners follow GETs); the button and the one-click header both POST.
 */
async function UnsubscribePage({ params }: PageProps<"/unsubscribe/[token]">) {
  const { token } = await params;
  const id = readUnsubscribeToken(token);
  const c = id ? await getContactById(id) : null;
  return (
    <PublicContainer>
      <div className="mx-auto max-w-md rounded-2xl border p-6 text-sm">
        <h1 className="text-xl font-semibold tracking-tight">Email preferences</h1>
        {!c ? (
          <p className="mt-3 text-muted-foreground">
            This link is not valid. If you copied it from an email, open the email and use the
            unsubscribe link again.
          </p>
        ) : c.emailOptOut ? (
          <p className="mt-3 text-muted-foreground">
            {c.email} is unsubscribed. You will not get proposals, payment requests or follow-ups by
            email. Booking confirmations and reminders for meetings you book still arrive.
          </p>
        ) : (
          <UnsubscribeForm token={token} email={c.email} />
        )}
      </div>
    </PublicContainer>
  );
}

export default function UnsubscribePageBoundary(props: PageProps<"/unsubscribe/[token]">) {
  return (
    <Suspense fallback={<PublicSkeleton />}>
      <UnsubscribePage {...props} />
    </Suspense>
  );
}
