"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PrinterIcon } from "lucide-react";
import {
  accommodationsAction,
  deleteRequestAction,
  recoverAction,
  withdrawAction,
} from "@/app/(public)/applications/[token]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { COPY } from "@/server/hiring/apply-text";

/*
 * The status page's interactive parts (P6–P8): withdraw and delete behind their dialogs, the
 * adjustments request, a printable copy, and link recovery. Every one acts through the token.
 */

const REASONS = [
  "I accepted another offer",
  "My plans changed",
  "The timing doesn't work",
  "Other",
];

export function WithdrawButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Withdraw my application
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{COPY.withdrawTitle}</DialogTitle>
            <DialogDescription>{COPY.withdrawBody}</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">Reason (optional)</legend>
            {REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {r}
              </label>
            ))}
            {reason === "Other" && (
              <Input
                aria-label="Your reason"
                maxLength={400}
                value={other}
                onChange={(e) => setOther(e.target.value)}
              />
            )}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep my application
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await withdrawAction(token, reason === "Other" ? other : reason);
                  if ("error" in r)
                    return setError(
                      "We couldn't withdraw your application. Try again, or reply to any of our emails.",
                    );
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? "Withdrawing…" : "Withdraw application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
        Delete my application
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{COPY.deleteTitle}</DialogTitle>
            <DialogDescription>{COPY.deleteBody}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteRequestAction(token);
                  if ("error" in r) return setError(r.error);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending && <Spinner data-icon="inline-start" />}
              Delete my application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdjustmentsForm({ token, initial }: { token: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await accommodationsAction(token, text);
          setStatus("error" in r ? r.error : "Saved. Only the program coordinators see this.");
        });
      }}
    >
      <label htmlFor="adjust" className="block text-sm font-medium">
        {COPY.adjustmentsQuestion}
      </label>
      <textarea
        id="adjust"
        rows={3}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby="adjust-help"
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
      />
      <p id="adjust-help" className="text-xs text-muted-foreground">
        {COPY.adjustmentsHelp}
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
        <span role="status" className="text-xs text-muted-foreground">
          {status}
        </span>
      </div>
    </form>
  );
}

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <PrinterIcon data-icon="inline-start" />
      Save a copy of your answers
    </Button>
  );
}

export function RecoverForm() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await recoverAction(email);
          setMsg(r.limited ? COPY.recoverLimited : COPY.recoverDone);
        });
      }}
    >
      <label htmlFor="recover-email" className="block text-sm font-medium">
        Email
      </label>
      <Input
        id="recover-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" variant="ink" disabled={pending} className="w-full sm:w-auto">
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? "Sending…" : "Send link"}
      </Button>
      <p role="status" className="text-sm">
        {msg}
      </p>
    </form>
  );
}
