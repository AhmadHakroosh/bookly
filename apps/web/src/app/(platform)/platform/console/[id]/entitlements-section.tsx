import { EE_FEATURES, entitlementMessage } from "@bookly/editions";
import type { Workspace } from "@bookly/db/schema";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Dropdown } from "@/components/dropdown";
import { DatePicker } from "@/components/date-picker";
import { eeEntitlement, listWorkspaceEntitlements } from "@/server/editions";
import { setWorkspaceEntitlementAction } from "../license/actions";

/**
 * Commercial features for this workspace (ADR 0006): how each resolves under the install's
 * license, and the operator grants that put an Enterprise contract on the hosted service.
 */
export async function EntitlementsSection({ ws }: { ws: Workspace }) {
  const [grants, resolved] = await Promise.all([
    listWorkspaceEntitlements(ws.id),
    Promise.all(EE_FEATURES.map(async (f) => [f, await eeEntitlement(ws, f)] as const)),
  ]);
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-base font-semibold tracking-tight">Commercial features</h3>
      <p className="text-xs text-muted-foreground">
        Enterprise features this workspace can use. On the hosted service they come from its plan
        and from grants here; a grant only works once the module is installed and the install holds
        a cloud license.
      </p>
      <ul className="mt-2 divide-y text-sm">
        {resolved.map(([feature, e]) => {
          const g = grants.find((x) => x.feature === feature);
          return (
            <li key={feature} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <code className="font-mono text-xs">{feature}</code>
                <Badge variant={e.ok ? "success" : "outline"}>{e.ok ? "available" : "off"}</Badge>
                {!e.ok && (
                  <span className="text-xs text-muted-foreground">{entitlementMessage(e)}</span>
                )}
              </span>
              {g && (
                <span className="text-xs text-muted-foreground">
                  granted
                  {g.expiresAt ? ` until ${g.expiresAt.toLocaleDateString()}` : ""}
                  {g.note ? ` · ${g.note}` : ""}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <form
        action={setWorkspaceEntitlementAction.bind(null, ws.id)}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <Dropdown
          name="feature"
          defaultValue={EE_FEATURES[0]}
          ariaLabel="Feature"
          className="w-52"
          options={EE_FEATURES.map((f) => ({ value: f, label: f }))}
        />
        <Dropdown
          name="mode"
          defaultValue="grant"
          ariaLabel="Mode"
          className="w-32"
          options={[
            { value: "grant", label: "Grant" },
            { value: "revoke", label: "Revoke" },
          ]}
        />
        <DatePicker name="until" ariaLabel="Until" placeholder="No expiry" className="w-40" />
        <Input name="note" placeholder="Contract or note" className="w-48" aria-label="Note" />
        <SubmitButton variant="outline">Apply</SubmitButton>
      </form>
    </section>
  );
}
