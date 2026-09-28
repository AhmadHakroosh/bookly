"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmPhoneCodeAction,
  sendPhoneCodeAction,
  testSlackAction,
  type PrefsState,
} from "./actions";

/**
 * Below the preferences form: proves the saved phone (code texted over the chosen channel)
 * and tests the saved Slack webhook. Both work on what is saved, so the form comes first.
 */
export function VerifyPanel({
  phone,
  verified,
  codePending,
  channelOn,
  slackUrl,
}: {
  phone: string;
  verified: boolean;
  /** A code is out and not yet expired. */
  codePending: boolean;
  channelOn: boolean;
  slackUrl: string;
}) {
  const [sending, startSend] = useTransition();
  const [testing, startTest] = useTransition();
  const [state, confirm, confirming] = useActionState(confirmPhoneCodeAction, {} as PrefsState);
  useEffect(() => {
    if (state.ok) toast.success("Phone verified");
    else if (state.error) toast.error(state.error);
  }, [state]);
  const report = (r: PrefsState, okText: string) => {
    if (r.ok) toast.success(okText);
    else toast.error(r.error ?? "Something went wrong");
  };
  return (
    <div className="space-y-4 rounded-xl border p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Phone</span>
        {!phone ? (
          <span className="text-muted-foreground">No number saved.</span>
        ) : verified ? (
          <Badge variant="outline">Verified</Badge>
        ) : (
          <Badge variant="outline">Not verified</Badge>
        )}
        {phone && !verified && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sending || !channelOn}
            onClick={() =>
              startSend(async () => report(await sendPhoneCodeAction(), `Code sent to ${phone}`))
            }
          >
            {sending ? "Sending…" : codePending ? "Send a new code" : "Send code"}
          </Button>
        )}
      </div>
      {phone && !verified && !channelOn && (
        <p className="text-muted-foreground">Pick SMS or WhatsApp above and save to verify.</p>
      )}
      {phone && !verified && codePending && (
        <form action={confirm} className="flex flex-wrap items-center gap-2">
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            className="w-36"
            required
          />
          <Button type="submit" size="sm" disabled={confirming}>
            {confirming ? "Checking…" : "Confirm"}
          </Button>
        </form>
      )}
      {phone && !verified && (
        <p className="text-muted-foreground">
          Texts are sent only to a verified number. Email pings work regardless.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="font-medium">Slack</span>
        {slackUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testing}
            onClick={() =>
              startTest(async () => report(await testSlackAction(), "Test message posted"))
            }
          >
            {testing ? "Posting…" : "Send a test message"}
          </Button>
        ) : (
          <span className="text-muted-foreground">No webhook saved.</span>
        )}
      </div>
    </div>
  );
}
