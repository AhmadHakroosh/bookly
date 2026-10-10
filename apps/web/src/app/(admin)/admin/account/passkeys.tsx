"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/action-button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { dismissed } from "@/lib/passkey-rp";
import { fmtDate } from "@/lib/time";

export type PasskeyRow = { id: string; name: string | null; createdAt: string | null };

/**
 * The passkeys registered for this account: add one on the current device (Touch ID, Windows
 * Hello, a security key or a password manager), or remove one. Signing in with a passkey
 * needs no password and cannot be phished to a look-alike host.
 */
export function Passkeys({
  passkeys,
  timezone,
  supported,
}: {
  passkeys: PasskeyRow[];
  timezone: string;
  /** Rendered server-side; the browser decides the final answer on mount. */
  supported: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const { error } = await authClient.passkey.addPasskey({
      name: name.trim() || "This device",
    });
    setBusy(false);
    if (error) {
      if (!dismissed(error)) toast.error(error.message ?? "Could not add a passkey");
      return;
    }
    setName("");
    toast.success("Passkey added");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await authClient.passkey.deletePasskey({ id });
    setBusy(false);
    if (error) return void toast.error(error.message ?? "Could not remove the passkey");
    toast.success("Passkey removed");
    router.refresh();
  }

  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-base font-semibold tracking-tight">Passkeys</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Sign in with your face, fingerprint or device PIN instead of a password. A passkey is stored
        on this device or in your password manager and only works on this site.
      </p>
      {passkeys.length > 0 && (
        <ul className="mb-4 divide-y">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                {p.name || "Passkey"}
                {p.createdAt && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    added {fmtDate(new Date(p.createdAt), timezone)}
                  </span>
                )}
              </span>
              <ActionButton
                variant="ghost"
                size="sm"
                disabled={busy}
                pendingText="Removing…"
                action={() => remove(p.id)}
              >
                Remove
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Passkey name"
            placeholder="This device"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full sm:w-56"
            maxLength={60}
          />
          <ActionButton
            variant="outline"
            disabled={busy}
            pendingText="Waiting for your device…"
            action={add}
          >
            Add a passkey
          </ActionButton>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This browser does not support passkeys.</p>
      )}
    </section>
  );
}
