"use client";

import { useActionState, useState, useTransition } from "react";
import { LockIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { OpportunityRole, OpportunityStatus } from "@bookly/db/schema";
import {
  inviteAction,
  removeInviteAction,
  removeTeamMemberAction,
  setTeamRoleAction,
  type InviteState,
} from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { ACCESS_SUMMARY, COLLABORATOR_EXPLAINER, ROLE_LABELS } from "@/server/hiring/setup-text";

export type TeamPerson = {
  userId: string;
  name: string;
  email: string;
  role: OpportunityRole;
  seat: "member" | "collaborator";
};
export type WorkspacePerson = {
  userId: string;
  name: string;
  email: string;
  collaborator: boolean;
};
export type PendingInvite = { id: string; email: string; role: OpportunityRole; sent: boolean };

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as OpportunityRole[]).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
}));

/**
 * S7, Team and access: who is on this opportunity's team and as what, with the seat each one
 * takes. Workspace members join at once; people from outside are invited as collaborators.
 */
export function TeamStep({
  oppId,
  title,
  status,
  team,
  invites,
  workspace,
  canInvite,
  seatLine,
  readOnly,
}: {
  oppId: string;
  title: string;
  status: OpportunityStatus;
  team: TeamPerson[];
  invites: PendingInvite[];
  workspace: WorkspacePerson[];
  canInvite: boolean;
  seatLine: string | null;
  readOnly: boolean;
}) {
  const [pending, start] = useTransition();
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<OpportunityRole>("reviewer");
  const [state, invite] = useActionState<InviteState, FormData>(
    inviteAction.bind(null, oppId, status, title),
    {},
  );
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
    });
  const onTeam = new Set(team.map((t) => t.userId));
  const candidates = workspace.filter((p) => !onTeam.has(p.userId));
  const adding = workspace.find((p) => p.userId === addUser);
  return (
    <div className="space-y-6" aria-busy={pending}>
      <div className="rounded-xl border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Team of {title}</caption>
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Person</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="hidden px-4 py-2 font-medium sm:table-cell">Seat</th>
              <th className="px-4 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {team.map((p) => (
              <tr key={p.userId}>
                <td className="px-4 py-2">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </td>
                <td className="px-4 py-2">
                  <Dropdown
                    ariaLabel={`Role of ${p.name}`}
                    size="sm"
                    value={p.role}
                    disabled={readOnly}
                    options={ROLE_OPTIONS.map((o) => ({
                      ...o,
                      disabled: o.value === "coordinator" && p.seat === "collaborator",
                    }))}
                    onValueChange={(v) =>
                      run(() => setTeamRoleAction(oppId, p.userId, v as OpportunityRole))
                    }
                  />
                </td>
                <td className="hidden px-4 py-2 sm:table-cell">
                  <StatusChip tone="neutral">
                    {p.seat === "member" ? "Member" : "Collaborator"}
                  </StatusChip>
                </td>
                <td className="px-4 py-2 text-right">
                  {!readOnly && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${p.name} from the team`}
                      onClick={() => run(() => removeTeamMemberAction(oppId, p.userId))}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {invites.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2">
                  <div className="font-medium">{i.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.sent ? "Invitation sent" : "Invitation goes out when you publish"}
                  </div>
                </td>
                <td className="px-4 py-2">{ROLE_LABELS[i.role]}</td>
                <td className="hidden px-4 py-2 sm:table-cell">
                  <StatusChip tone="info">Invited</StatusChip>
                </td>
                <td className="px-4 py-2 text-right">
                  {!readOnly && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Withdraw the invitation to ${i.email}`}
                      onClick={() => run(() => removeInviteAction(oppId, i.id))}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {team.length + invites.length === 1 && (
          <p className="border-t px-4 py-3 text-sm text-muted-foreground">
            Add the people who will review and interview.
          </p>
        )}
        {seatLine && <p className="border-t px-4 py-2 text-xs text-muted-foreground">{seatLine}</p>}
      </div>

      {!readOnly && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="add-member" className="space-y-3 rounded-xl border bg-card p-4">
            <h3 id="add-member" className="text-sm font-semibold">
              Add someone from the workspace
            </h3>
            {candidates.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <Dropdown
                    ariaLabel="Person"
                    value={addUser}
                    placeholder="Choose a person"
                    options={candidates.map((p) => ({
                      value: p.userId,
                      label: `${p.name}${p.collaborator ? " (collaborator)" : ""}`,
                    }))}
                    onValueChange={setAddUser}
                  />
                </div>
                <div className="w-40">
                  <Dropdown
                    ariaLabel="Role"
                    value={addRole}
                    options={ROLE_OPTIONS.map((o) => ({
                      ...o,
                      disabled: o.value === "coordinator" && !!adding?.collaborator,
                    }))}
                    onValueChange={(v) => setAddRole(v as OpportunityRole)}
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={!addUser || pending}
                  onClick={() =>
                    run(async () => {
                      const r = await setTeamRoleAction(oppId, addUser, addRole);
                      if (!r.error) setAddUser("");
                      return r;
                    })
                  }
                >
                  {pending && <Spinner data-icon="inline-start" />}
                  Add
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Everyone in the workspace is on the team.
              </p>
            )}
            {adding?.collaborator && (
              <p className="text-xs text-muted-foreground">
                Collaborators can&apos;t coordinate. Upgrade them to a member seat first.
              </p>
            )}
          </section>
          <section aria-labelledby="invite" className="space-y-3 rounded-xl border bg-card p-4">
            <h3 id="invite" className="text-sm font-semibold">
              Invite by email
            </h3>
            <p className="text-xs text-muted-foreground">{COLLABORATOR_EXPLAINER}</p>
            {canInvite ? (
              <form action={invite} className="flex flex-wrap items-end gap-2">
                <Input
                  name="email"
                  type="email"
                  required
                  aria-label="Email"
                  placeholder="sam@uni.edu"
                  className="min-w-48 flex-1"
                />
                <div className="w-40">
                  <Dropdown
                    name="role"
                    ariaLabel="Role"
                    defaultValue="reviewer"
                    options={ROLE_OPTIONS.filter((o) => o.value !== "coordinator")}
                  />
                </div>
                <SubmitButton variant="outline">Invite</SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask a workspace owner or admin to invite people from outside the workspace.
              </p>
            )}
            <p role="status" className="text-xs">
              {state.error ? (
                <span className="text-destructive">{state.error}</span>
              ) : state.done === "invited" ? (
                status === "open" ? (
                  "Invitation sent."
                ) : (
                  "Invitations go out when you publish."
                )
              ) : state.done === "member" ? (
                "Already in the workspace: added to the team."
              ) : null}
            </p>
          </section>
        </div>
      )}

      <section aria-labelledby="access" className="rounded-xl border bg-card p-4">
        <h3 id="access" className="text-sm font-semibold">
          Who sees what
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{ACCESS_SUMMARY}</p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <LockIcon className="size-3.5" aria-hidden />
            Confidential opportunity · Hide this opportunity from workspace admins who aren&apos;t
            on the team.
          </span>
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">Enterprise</span>
        </div>
      </section>
    </div>
  );
}
