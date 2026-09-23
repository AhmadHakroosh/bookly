"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeftIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  previewOutreach,
  sendFollowUp,
  sendPaymentRequest,
  sendProposal,
  type OutreachPreview,
} from "../actions";
import { NumberField } from "@/components/number-field";

type T = { subject: string; body: string };
type Kind = "proposal" | "payment" | "followUp";
const SERVER_KIND = {
  proposal: "proposal",
  payment: "paymentRequest",
  followUp: "checkIn",
} as const;

/**
 * Proposal, payment-request and follow-up emails in two steps: edit the prefilled template,
 * preview the exact email the contact will receive, then send. `initial` opens a composer at
 * once (the inbox links here with the follow-up ready to go).
 */
export function Outreach({
  contactId,
  proposal,
  payment,
  followUp,
  stripe,
  initial = null,
}: {
  contactId: string;
  proposal: T;
  payment: T;
  followUp: T;
  stripe: boolean;
  initial?: Kind | null;
}) {
  const [open, setOpen] = useState<Kind | null>(initial);
  // The kind the dialog was opened for: `open` clears on send, and the dialog's labels must not
  // flip to another kind while it fades out.
  const [dialogKind, setDialogKind] = useState<Kind>(initial ?? "proposal");
  const templates: Record<Kind, T> = { proposal, payment, followUp };
  const [preview, setPreview] = useState<OutreachPreview | null>(null);
  const [pending, start] = useTransition();
  const [sending, startSend] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm";

  function switchTo(kind: Kind) {
    setPreview(null);
    setOpen(open === kind ? null : kind);
  }

  function showPreview() {
    const form = formRef.current;
    if (!form || !open) return;
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    start(async () => {
      const res = await previewOutreach(contactId, SERVER_KIND[open], fd);
      if ("error" in res) toast.error(res.error);
      else {
        setDialogKind(open);
        setPreview(res);
      }
    });
  }

  function send() {
    const form = formRef.current;
    if (!form || !open) return;
    const fd = new FormData(form);
    startSend(async () => {
      if (open === "proposal") await sendProposal(contactId, fd);
      else if (open === "followUp") await sendFollowUp(contactId, fd);
      else await sendPaymentRequest(contactId, fd);
      toast.success(
        open === "proposal"
          ? "Proposal sent"
          : open === "followUp"
            ? "Follow-up sent"
            : "Payment request sent",
      );
      setPreview(null);
      setOpen(null);
    });
  }

  return (
    <section className="rounded-xl border p-4 text-sm">
      <h2 className="text-base font-semibold tracking-tight">Send</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={open === "proposal" ? "default" : "outline"}
          onClick={() => switchTo("proposal")}
        >
          Proposal
        </Button>
        <Button
          type="button"
          variant={open === "payment" ? "default" : "outline"}
          onClick={() => switchTo("payment")}
        >
          Payment request
        </Button>
        <Button
          type="button"
          variant={open === "followUp" ? "default" : "outline"}
          onClick={() => switchTo("followUp")}
        >
          Follow-up
        </Button>
      </div>

      {open && (
        // Keyed by kind: switching remounts the form with the other template's subject and body.
        <form
          key={open}
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          className="mt-3 space-y-2"
        >
          {open === "payment" && (
            <>
              <div className="flex gap-2">
                <NumberField
                  name="amount"
                  min={1}
                  step={1}
                  decimals={2}
                  placeholder="Amount"
                  ariaLabel="Amount"
                  required
                  className="flex-1"
                  inputClassName="h-9 text-left"
                />
                <input name="currency" defaultValue="usd" className={`${field} h-9 w-24`} />
              </div>
              <input name="description" placeholder="What it is for" className={`${field} h-9`} />
            </>
          )}
          <input
            name="subject"
            defaultValue={templates[open].subject}
            className={`${field} h-9`}
            placeholder="Subject"
            required
          />
          <textarea
            name="body"
            defaultValue={templates[open].body}
            rows={8}
            className={field}
            required
          />
          {open === "payment" && (
            <p className="text-xs text-muted-foreground">
              {stripe
                ? "{payLink} becomes a Stripe Checkout link for this amount, and the email gets a Pay button."
                : "Stripe is not set up: {payLink} is left out, add your own payment instructions."}{" "}
              {"{amount}"} is filled in.
            </p>
          )}
          {open === "followUp" && (
            <p className="text-xs text-muted-foreground">
              {"{bookingUrl}"} becomes a link to your booking page.
            </p>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {open === "proposal"
              ? "Follow up if no reply in"
              : open === "followUp"
                ? "Remind me again in"
                : "Follow up if unpaid in"}
            <NumberField
              name="followUpDays"
              min={0}
              max={60}
              defaultValue={open === "proposal" ? 5 : 7}
              unit="days"
              ariaLabel="Follow up in days"
              className="w-40"
            />
          </label>
          <Button type="button" onClick={showPreview} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Preview email
          </Button>
        </form>
      )}

      <Dialog open={!!(open && preview)} onOpenChange={(o) => !o && !sending && setPreview(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialogKind === "proposal"
                ? "Review the proposal"
                : dialogKind === "followUp"
                  ? "Review the follow-up"
                  : "Review the payment request"}
            </DialogTitle>
            <DialogDescription>
              This is exactly what {preview?.to} will receive. Nothing is sent until you confirm.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                <p>
                  <span className="text-muted-foreground">To</span> {preview.to}
                </p>
                <p>
                  <span className="text-muted-foreground">Subject</span>{" "}
                  <span className="font-medium text-foreground">{preview.subject}</span>
                </p>
                {preview.note && <p className="mt-1 text-muted-foreground">{preview.note}</p>}
              </div>
              <iframe
                title="Email preview"
                // No scripts; same-origin so the logo loads under the page's CSP.
                sandbox="allow-same-origin"
                srcDoc={preview.html}
                className="h-[520px] w-full rounded-lg border bg-white"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={sending}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Back to edit
            </Button>
            <Button type="button" onClick={send} disabled={sending}>
              {sending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SendIcon data-icon="inline-start" />
              )}
              {dialogKind === "proposal"
                ? "Send proposal"
                : dialogKind === "followUp"
                  ? "Send follow-up"
                  : "Send payment request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
