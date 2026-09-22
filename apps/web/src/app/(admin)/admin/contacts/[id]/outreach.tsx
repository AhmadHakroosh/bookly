"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sendPaymentRequest, sendProposal } from "../actions";

type T = { subject: string; body: string };

/** Proposal and payment-request emails, prefilled from the workspace templates. */
export function Outreach({
  contactId,
  proposal,
  payment,
  stripe,
}: {
  contactId: string;
  proposal: T;
  payment: T;
  stripe: boolean;
}) {
  const [open, setOpen] = useState<"proposal" | "payment" | null>(null);
  const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  return (
    <section className="rounded-xl border p-4 text-sm">
      <h2 className="text-base font-semibold tracking-tight">Send</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={open === "proposal" ? "default" : "outline"}
          onClick={() => setOpen(open === "proposal" ? null : "proposal")}
        >
          Proposal
        </Button>
        <Button
          type="button"
          variant={open === "payment" ? "default" : "outline"}
          onClick={() => setOpen(open === "payment" ? null : "payment")}
        >
          Payment request
        </Button>
      </div>
      {open === "proposal" && (
        <form action={sendProposal.bind(null, contactId)} className="mt-3 space-y-2">
          <input
            name="subject"
            defaultValue={proposal.subject}
            className={`${field} h-9`}
            placeholder="Subject"
          />
          <textarea name="body" defaultValue={proposal.body} rows={8} className={field} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Follow up if no reply in
            <input
              name="followUpDays"
              type="number"
              min={0}
              max={60}
              defaultValue={5}
              className="h-7 w-16 rounded-md border bg-background px-2"
            />
            days
          </label>
          <Button type="submit">Send proposal</Button>
        </form>
      )}
      {open === "payment" && (
        <form action={sendPaymentRequest.bind(null, contactId)} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              name="amount"
              type="number"
              min={1}
              step="0.01"
              placeholder="Amount"
              className={`${field} h-9`}
              required
            />
            <input name="currency" defaultValue="usd" className={`${field} h-9 w-24`} />
          </div>
          <input name="description" placeholder="What it is for" className={`${field} h-9`} />
          <input
            name="subject"
            defaultValue={payment.subject}
            className={`${field} h-9`}
            placeholder="Subject"
          />
          <textarea name="body" defaultValue={payment.body} rows={7} className={field} />
          <p className="text-xs text-muted-foreground">
            {stripe
              ? "{payLink} becomes a Stripe Checkout link for this amount."
              : "Stripe is not set up: {payLink} is left out, add your own payment instructions."}{" "}
            {"{amount}"} is filled in.
          </p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Follow up if unpaid in
            <input
              name="followUpDays"
              type="number"
              min={0}
              max={60}
              defaultValue={7}
              className="h-7 w-16 rounded-md border bg-background px-2"
            />
            days
          </label>
          <Button type="submit">Send request</Button>
        </form>
      )}
    </section>
  );
}
