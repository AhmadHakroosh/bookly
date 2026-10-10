import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Dropdown } from "@/components/dropdown";
import { DatePicker } from "@/components/date-picker";
import { FLAGS, FLAG_KEYS, flagsFor, listCohorts, workspaceFlagState } from "@/server/flags";
import type { Workspace } from "@bookly/db/schema";
import { setWorkspaceFlagAction, toggleWorkspaceCohort } from "../flags/actions";

/** The workspace's flags as they resolve, with grant/deny controls and cohort membership. */
export async function FlagsSection({ ws }: { ws: Workspace }) {
  const [resolved, state, cohorts] = await Promise.all([
    flagsFor(ws),
    workspaceFlagState(ws.id),
    listCohorts(),
  ]);
  const grant = (key: string) => state.grants.find((g) => g.flagKey === key);
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-base font-semibold tracking-tight">Feature flags</h3>
      <p className="text-xs text-muted-foreground">
        How each flag resolves for this workspace
        {ws.settings.betaOptOut ? " (it opted out of betas, so only flags that are on apply)" : ""}.
        A grant opens a beta flag for this workspace alone; a denial hides a flag even when it is on
        for everyone.
      </p>
      <ul className="mt-2 divide-y text-sm">
        {resolved.map((f) => {
          const g = grant(f.key);
          return (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <code className="font-mono text-xs">{f.key}</code>
                <Badge variant={f.on ? "default" : "outline"}>{f.on ? "live" : "not live"}</Badge>
                {g && (
                  <span className="text-xs text-muted-foreground">
                    {g.mode === "grant" ? "granted" : "denied"}
                    {g.expiresAt ? ` until ${g.expiresAt.toLocaleDateString()}` : ""}
                    {g.note ? ` · ${g.note}` : ""}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <form
        action={setWorkspaceFlagAction.bind(null, ws.id)}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <Dropdown
          name="key"
          defaultValue={FLAG_KEYS[0]}
          ariaLabel="Flag"
          className="w-44"
          options={FLAG_KEYS.map((k) => ({ value: k, label: k }))}
        />
        <Dropdown
          name="mode"
          defaultValue="grant"
          ariaLabel="Mode"
          className="w-32"
          options={[
            { value: "grant", label: "Grant" },
            { value: "deny", label: "Deny" },
            { value: "clear", label: "Clear" },
          ]}
        />
        <DatePicker name="until" ariaLabel="Until" placeholder="No expiry" className="w-40" />
        <Input name="note" placeholder="Note" className="w-48" aria-label="Note" />
        <SubmitButton variant="outline">Apply</SubmitButton>
      </form>
      {cohorts.length > 0 && (
        <>
          <h4 className="mt-5 text-sm font-semibold">Cohorts</h4>
          <ul className="mt-1 flex flex-wrap gap-2">
            {cohorts.map((c) => {
              const member = state.cohorts.some((x) => x.id === c.id);
              return (
                <li key={c.id}>
                  <form action={toggleWorkspaceCohort.bind(null, ws.id)}>
                    <input type="hidden" name="cohortId" value={c.id} />
                    <input type="hidden" name="member" value={member ? "off" : "on"} />
                    <SubmitButton variant={member ? "secondary" : "outline"} size="sm">
                      {member ? `In ${c.name} · remove` : `Add to ${c.name}`}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{Object.keys(FLAGS).length} flags known.</p>
    </section>
  );
}
